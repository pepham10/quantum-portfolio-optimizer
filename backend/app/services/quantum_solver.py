"""QAOA (Quantum Approximate Optimization Algorithm) on a simulated quantum computer.

The loop, in plain terms:
  1. Turn the QUBO into an energy function (a "Hamiltonian") over qubits.
     Bit x_i becomes qubit i; low energy = good portfolio.
  2. Build a circuit: start every qubit in an equal superposition of 0 and 1
     (all 2^n portfolios at once), then repeat `reps` layers of
        - a cost layer   exp(-i * gamma * H_cost): each portfolio's phase is turned
          in proportion to its cost. RZ gates encode single-stock terms; RZZ gates
          encode pairwise terms (covariance and the budget penalty).
        - a mixer layer  exp(-i * beta * sum X): RX gates let amplitude flow between
          portfolios that differ by one stock, so the phases interfere.
  3. Measure many times ("shots"), giving a histogram of bitstrings.
  4. A classical optimizer (COBYLA) adjusts the angles (gamma, beta) to lower the
     cost of the best outcomes (CVaR, see below), and we go back to step 2.
     (On a simulator we compute this exactly from the statevector instead of
     estimating it from shots, as a real device would have to.)
Good angles make interference pile probability onto low-cost bitstrings.
The answer is the cheapest bitstring among the final shots.

Noise: the angles are trained on the ideal simulator, then the *same* circuit
with the *same* angles is also run on a simulated noisy IBM device. Any
difference between the two histograms is caused purely by hardware noise.

Honest note: with only 1-3 layers, QAOA boosts the probability of good answers
but often gives the best and second-best portfolio similar odds. At 3-5 qubits a
classical computer simply checks all 2^n options, so there is no speedup here.

We write this loop out by hand (instead of a library QAOA class) so every step
is visible.
"""

from __future__ import annotations

import io
import time
from dataclasses import dataclass, field

import numpy as np
from qiskit import QuantumCircuit
from qiskit.circuit.library import qaoa_ansatz
from qiskit.quantum_info import SparsePauliOp, Statevector
from qiskit.transpiler import generate_preset_pass_manager
from qiskit_aer import AerSimulator
from qiskit_aer.primitives import SamplerV2
from scipy.optimize import minimize

from app.services.qubo import Qubo, all_bitstrings, from_bitstring, to_bitstring, to_quadratic_program

MAX_LAYERS = 3  # always trained up to here, so the app can compare 1, 2 and 3 layers
NOISY_DEVICE = "FakeManilaV2"  # snapshot of a retired 5-qubit IBM device: noise rates + wiring
TWO_QUBIT_GATES = ("cx", "ecr", "cz", "swap", "rzz")


@dataclass
class Run:
    """One final batch of shots on one (simulated) device."""

    counts: dict[str, int]       # bitstring (stock order, left to right) -> shots
    best_bitstring: str          # lowest-cost bitstring among the measured shots
    best_cost: float
    most_likely_bitstring: str   # most frequently measured bitstring
    expected_cost: float         # average cost over all shots
    circuit_depth: int           # after compiling to the device's native gates
    two_qubit_gates: int
    backend_name: str
    runtime_ms: float


@dataclass
class QaoaResult:
    ideal: Run
    noisy: Run | None
    optimal_params: dict[str, list[float]]
    history: list[float]         # average cost at each optimizer step
    circuit_svg: str
    shots: int
    training_ms: float
    hamiltonian: list[dict] = field(default_factory=list)
    # For teaching: exact probabilities of every bitstring (stock order) at the
    # start and after each layer, using the trained angles.
    evolution: list[dict[str, float]] = field(default_factory=list)
    # The 1-layer angles the optimizer settled on before adding more layers.
    layer1_params: dict[str, float] = field(default_factory=dict)
    # "More layers or fewer?": for 1..MAX_LAYERS layers, each trained on its own,
    # the exact ideal odds, sampled noisy-chip odds, and the chip's operation count.
    layer_study: list[dict] = field(default_factory=list)


def build_hamiltonian(qubo: Qubo) -> tuple[SparsePauliOp, float]:
    """QUBO -> Ising Hamiltonian, rescaled so the largest coefficient is 1.

    Substituting x_i = (1 - Z_i) / 2 turns f(x) into a sum of Z and ZZ terms
    (qiskit-optimization does this algebra). Rescaling does not change which
    bitstring is best, but keeps good gamma angles in a predictable range.
    """
    op, _offset = to_quadratic_program(qubo).to_ising()
    scale = float(np.max(np.abs(op.coeffs.real))) or 1.0
    return (op / scale).simplify(), scale


class Device:
    """A simulator plus the compiler settings that match it."""

    def __init__(self, noisy: bool, seed: int):
        if noisy:
            from qiskit_ibm_runtime.fake_provider import FakeManilaV2

            # Copies the device's gate error rates, T1/T2 decay times, readout
            # errors and qubit wiring into the simulator.
            self.backend = AerSimulator.from_backend(FakeManilaV2())
            self.name = NOISY_DEVICE
        else:
            self.backend = AerSimulator()
            self.name = "AerSimulator (ideal)"
        self.pass_manager = generate_preset_pass_manager(
            optimization_level=1, backend=self.backend, seed_transpiler=seed
        )
        self.sampler = SamplerV2.from_backend(self.backend, seed=seed)

    def compile(self, hamiltonian: SparsePauliOp, layers: int) -> QuantumCircuit:
        """H on every qubit, then `layers` x (cost layer, mixer layer), then measure.

        Parameters are named β[0..layers-1] and γ[0..layers-1]; Qiskit sorts them
        so the parameter vector is [β..., γ...]. Compiling translates to gates the
        device supports; on the noisy device it also inserts SWAPs, because not
        every pair of qubits is physically wired together.
        """
        circuit = qaoa_ansatz(hamiltonian, reps=layers, insert_barriers=True)
        circuit.measure_all()
        return self.pass_manager.run(circuit)

    def sample(self, circuit: QuantumCircuit, param_sets: np.ndarray, shots: int) -> list[dict[str, int]]:
        """Run the circuit once per row of angles, in a single batched simulator call."""
        data = self.sampler.run([(circuit, param_sets)], shots=shots).result()[0].data.meas
        return [data.get_counts(i) for i in range(len(param_sets))]


def _interp(angles: np.ndarray) -> np.ndarray:
    """INTERP: p optimized angles -> p + 1 starting angles by linear interpolation."""
    p = len(angles)
    padded = np.concatenate([[0.0], angles, [0.0]])
    i = np.arange(1, p + 2)
    return (i - 1) / p * padded[i - 1] + (p - i + 1) / p * padded[i]


def one_layer_landscape(
    hamiltonian: SparsePauliOp, betas: np.ndarray, gammas: np.ndarray
) -> np.ndarray:
    """Exact 1-layer QAOA probabilities for every (beta, gamma) pair, in plain numpy.

    Returns an array of shape (len(betas), len(gammas), 2^n) indexed like
    Statevector.probabilities(). The math, written out:
      |+>^n                      equal superposition (amplitude 1/sqrt(2^n) each)
      exp(-i gamma H)            H is diagonal, so each bitstring just gets a phase
      exp(-i beta X) per qubit   the mixer, the 2x2 matrix [[cos, -i sin], [-i sin, cos]]
    Doing it by hand (instead of ~500 separate circuit simulations) keeps it fast.
    """
    n = hamiltonian.num_qubits
    energies = np.real(np.diag(hamiltonian.to_matrix()))  # one energy per bitstring
    psi = np.exp(-1j * gammas[:, None] * energies[None, :]) / np.sqrt(2**n)  # (G, 2^n)
    psi = np.broadcast_to(psi, (len(betas), *psi.shape)).copy()  # (B, G, 2^n)
    c = np.cos(betas)[:, None, None, None]
    s = (-1j * np.sin(betas))[:, None, None, None]
    for q in range(n):
        # Split the index into (high bits, qubit q, low bits) and mix qubit q's pair.
        view = psi.reshape(len(betas), len(gammas), 2 ** (n - 1 - q), 2, 2**q)
        a0, a1 = view[..., 0, :].copy(), view[..., 1, :].copy()
        view[..., 0, :] = c * a0 + s * a1
        view[..., 1, :] = s * a0 + c * a1
    return np.abs(psi) ** 2


def textbook_circuit(
    hamiltonian: SparsePauliOp, reps: int, labels: list[str], decimals: int | None = 2
) -> QuantumCircuit:
    """The QAOA circuit written with the gates you see in textbooks.

    For H = sum_i h_i Z_i + sum_{i<j} J_ij Z_i Z_j:
      exp(-i gamma H)          = product of RZ(2 gamma h_i) and RZZ(2 gamma J_ij)
      exp(-i beta sum_i X_i)   = RX(2 beta) on every qubit
    Mathematically identical to Qiskit's qaoa_ansatz (checked in the tests), but
    much easier to read than the library's internal gate decomposition.
    Coefficients are rounded to `decimals` for display (None = exact).
    """
    from qiskit import QuantumRegister
    from qiskit.circuit import ParameterVector

    def r(x: float) -> float:
        return x if decimals is None else round(x, decimals)

    n = hamiltonian.num_qubits
    qc = QuantumCircuit(*[QuantumRegister(1, name) for name in labels])
    beta, gamma = ParameterVector("β", reps), ParameterVector("γ", reps)
    qc.h(range(n))
    for layer in range(reps):
        qc.barrier()
        for pauli, coeff in zip(hamiltonian.paulis, hamiltonian.coeffs.real):
            qubits = [i for i, z in enumerate(pauli.z) if z]
            if len(qubits) == 1:
                qc.rz(r(2 * coeff) * gamma[layer], qubits[0])
            elif len(qubits) == 2:
                qc.rzz(r(2 * coeff) * gamma[layer], *qubits)
        qc.barrier()
        qc.rx(2 * beta[layer], range(n))
    qc.barrier()
    qc.measure_all(add_bits=True)
    return qc


# Matches the web app's dark palette (web/src/tokens.css) so the diagram sits on the page.
CIRCUIT_STYLE = {
    "backgroundcolor": "#14171f",
    "textcolor": "#e9ebf0",
    "gatetextcolor": "#14171f",
    "subtextcolor": "#14171f",
    "linecolor": "#5d6475",
    "creglinecolor": "#5d6475",
    "barrierfacecolor": "#1f232d",
    "fontsize": 13,
    "subfontsize": 9,
    "displaycolor": {
        "h": ["#9fd8db", "#14171f"],
        "rz": ["#c9cdd8", "#14171f"],
        "rzz": ["#5cc3c8", "#14171f"],
        "rx": ["#e4c88f", "#14171f"],
        "measure": ["#e9ebf0", "#14171f"],
    },
}


def draw_circuit_svg(hamiltonian: SparsePauliOp, reps: int, labels: list[str]) -> str:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig = textbook_circuit(hamiltonian, reps, labels).draw(
        "mpl", style=CIRCUIT_STYLE, fold=-1, cregbundle=True, plot_barriers=True,
    )
    buf = io.StringIO()
    fig.savefig(buf, format="svg", bbox_inches="tight", facecolor=CIRCUIT_STYLE["backgroundcolor"])
    plt.close(fig)
    return buf.getvalue()


def run_qaoa(
    qubo: Qubo,
    reps: int = 2,
    shots: int = 2048,
    with_noise: bool = True,
    maxiter: int = 60,
    seed: int = 42,
    labels: list[str] | None = None,
    draw: bool = True,
    cvar_alpha: float = 0.5,
) -> QaoaResult:
    t0 = time.perf_counter()
    n = qubo.n
    labels = labels or [f"x{i}" for i in range(n)]
    hamiltonian, _ = build_hamiltonian(qubo)
    ideal = Device(noisy=False, seed=seed)

    # Cost of every possible bitstring, keyed in Qiskit's bit order (qubit 0 is
    # the rightmost character), so each measured shot is scored by a lookup.
    X = all_bitstrings(n)
    cost_table = {to_bitstring(x)[::-1]: c for x, c in zip(X, qubo.costs(X))}
    # Same costs as a vector indexed like Statevector.probabilities().
    cost_vector = np.array([cost_table[format(i, f"0{n}b")] for i in range(2**n)])

    def average_cost(counts: dict[str, int]) -> float:
        return sum(cost_table[b] * v for b, v in counts.items()) / sum(counts.values())

    history: list[float] = []

    def expected_cost(ansatz: QuantumCircuit, x: np.ndarray) -> float:
        """Training objective for angles x, computed exactly from the statevector.

        A real device can only *estimate* this from shots. On a simulator we can
        read it off the statevector exactly, which makes training faster and
        steadier (no shot noise). Final answers still come from sampled shots.
        """
        probs = Statevector(ansatz.assign_parameters(x)).probabilities()
        if cvar_alpha >= 1:
            return float(probs @ cost_vector)
        # CVaR (Barkoutsos et al., 2020): average cost of only the best `cvar_alpha`
        # share of probability mass (default: the best half). The plain average is
        # dominated by the big budget penalty, so it is happy spreading probability
        # evenly over all valid portfolios; CVaR instead rewards piling probability
        # on the best ones. With alpha = 0.5 its minimum is reached only when the
        # optimum holds at least half the probability, i.e. is the most likely outcome.
        order = np.argsort(cost_vector)
        mass = np.minimum(np.cumsum(probs[order]), cvar_alpha)
        taken = np.diff(np.concatenate([[0.0], mass]))
        return float(taken @ cost_vector[order] / cvar_alpha)

    def polish(ansatz: QuantumCircuit, start: np.ndarray):
        def objective(x: np.ndarray) -> float:
            value = expected_cost(ansatz, x)
            history.append(value)
            return value
        return minimize(objective, start, method="COBYLA", options={"maxiter": maxiter, "rhobeg": 0.15})

    # Step A (1 layer): the energy landscape is bumpy, so a local optimizer started
    # in the wrong place gets stuck. Scan a coarse grid of (beta, gamma) angles,
    # then polish the 3 most promising grid points with COBYLA.
    ansatz = qaoa_ansatz(hamiltonian, reps=1)
    betas, gammas = np.meshgrid(np.linspace(0.1, np.pi - 0.1, 8), np.linspace(0.2, 2 * np.pi - 0.2, 16))
    grid = np.column_stack([betas.ravel(), gammas.ravel()])
    grid_scores = np.array([expected_cost(ansatz, x) for x in grid])
    history.append(float(grid_scores.min()))
    params = min((polish(ansatz, grid[i]) for i in np.argsort(grid_scores)[:3]), key=lambda r: r.fun).x
    layer1 = params.copy()
    trained = {1: params.copy()}

    for layers in range(2, MAX_LAYERS + 1):
        # Step B: grow to one more layer. Two candidate starting points:
        #  - INTERP (Zhou et al., 2020): stretch the angle schedule onto one more layer
        #  - previous angles plus an "off" layer (beta = gamma = 0), which reproduces
        #    the shallower circuit exactly, so the deeper one can only improve on it
        ansatz = qaoa_ansatz(hamiltonian, reps=layers)
        b, g = params[: layers - 1], params[layers - 1 :]
        candidates = [
            np.concatenate([_interp(b), _interp(g)]),
            np.concatenate([b, [0.0], g, [0.0]]),
        ]
        start = min(candidates, key=lambda x: expected_cost(ansatz, x))
        params = polish(ansatz, start).x
        trained[layers] = params.copy()

    params = trained[reps]
    training_ms = (time.perf_counter() - t0) * 1000

    def final_run(device: Device) -> Run:
        t = time.perf_counter()
        compiled = device.compile(hamiltonian, reps)
        raw = device.sample(compiled, params[None, :], shots)[0]
        counts = {b[::-1]: v for b, v in sorted(raw.items(), key=lambda kv: -kv[1])}
        # Standard QAOA readout: every shot is a candidate answer whose cost can
        # be checked classically, so we keep the cheapest one we saw.
        best = min(counts, key=lambda b: qubo.cost(from_bitstring(b)))
        ops = compiled.count_ops()
        return Run(
            counts=counts,
            best_bitstring=best,
            best_cost=qubo.cost(from_bitstring(best)),
            most_likely_bitstring=next(iter(counts)),
            expected_cost=average_cost(raw),
            circuit_depth=compiled.depth(),
            two_qubit_gates=int(sum(v for gate, v in ops.items() if gate in TWO_QUBIT_GATES)),
            backend_name=device.name,
            runtime_ms=(time.perf_counter() - t) * 1000,
        )

    def stock_order_probs(probs: np.ndarray) -> dict[str, float]:
        return {format(i, f"0{n}b")[::-1]: float(p) for i, p in enumerate(probs)}

    # Probabilities after 0, 1, ..., reps layers. The first l layers of the trained
    # circuit are exactly a reps=l circuit with the first l betas and gammas.
    evolution = [stock_order_probs(np.full(2**n, 1 / 2**n))]
    for layers in range(1, reps + 1):
        partial = np.concatenate([params[:layers], params[reps : reps + layers]])
        state = Statevector(qaoa_ansatz(hamiltonian, reps=layers).assign_parameters(partial))
        evolution.append(stock_order_probs(state.probabilities()))

    noisy_device = Device(noisy=True, seed=seed) if with_noise else None
    layer_study = []
    for layers, angles in trained.items():
        exact = Statevector(qaoa_ansatz(hamiltonian, reps=layers).assign_parameters(angles)).probabilities()
        entry = {"layers": layers, "ideal": stock_order_probs(exact)}
        if noisy_device:
            compiled = noisy_device.compile(hamiltonian, layers)
            raw = noisy_device.sample(compiled, angles[None, :], 2048)[0]
            entry["noisy"] = {b[::-1]: v / 2048 for b, v in raw.items()}
            ops = compiled.count_ops()
            entry["chip_two_qubit_gates"] = int(sum(v for g, v in ops.items() if g in TWO_QUBIT_GATES))
            entry["chip_depth"] = compiled.depth()
        layer_study.append(entry)

    return QaoaResult(
        layer_study=layer_study,
        evolution=evolution,
        layer1_params={"beta": float(layer1[0]), "gamma": float(layer1[1])},
        ideal=final_run(ideal),
        noisy=final_run(noisy_device) if noisy_device else None,
        optimal_params={
            "beta": [float(x) for x in params[:reps]],
            "gamma": [float(x) for x in params[reps:]],
        },
        history=[float(h) for h in history],
        circuit_svg=draw_circuit_svg(hamiltonian, reps, labels) if draw else "",
        shots=shots,
        training_ms=training_ms,
        hamiltonian=[
            {"pauli": p.to_label()[::-1], "coeff": float(c.real)}
            for p, c in zip(hamiltonian.paulis, hamiltonian.coeffs)
        ],
    )
