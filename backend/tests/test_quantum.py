import numpy as np
import pytest
from qiskit.circuit.library import qaoa_ansatz
from qiskit.quantum_info import Statevector

from app.services.classical_solver import brute_force
from app.services.qubo import all_bitstrings, build_qubo, to_bitstring
from app.services.quantum_solver import _interp, build_hamiltonian, one_layer_landscape, run_qaoa, textbook_circuit
from tests.conftest import random_instance


def test_hamiltonian_energies_match_qubo_costs():
    """Ising energies must order bitstrings exactly like the QUBO (same best answer)."""
    mu, sigma = random_instance(4, seed=3)
    q = build_qubo(mu, sigma, risk=0.5, k=2)
    H, scale = build_hamiltonian(q)
    diag = np.real(np.diag(H.to_matrix()))  # index = Qiskit bit order (qubit 0 = rightmost)
    X = all_bitstrings(4)
    energies = np.array([diag[int(to_bitstring(x)[::-1], 2)] for x in X])
    costs = q.costs(X)
    # Affine relation: cost = scale * energy + offset.
    assert np.allclose(costs - scale * energies, (costs - scale * energies)[0])
    assert to_bitstring(X[np.argmin(energies)]) == brute_force(q).bitstring


def test_textbook_circuit_equals_qiskit_ansatz():
    mu, sigma = random_instance(4, seed=1)
    H, _ = build_hamiltonian(build_qubo(mu, sigma, risk=0.4, k=2))
    params = np.array([0.3, 0.7, 1.1, 2.0])  # [beta0, beta1, gamma0, gamma1]
    ours = textbook_circuit(H, 2, list("ABCD"), decimals=None)
    ours.remove_final_measurements()
    ref = qaoa_ansatz(H, reps=2)
    fidelity = abs(Statevector(ref.assign_parameters(params)).inner(
        Statevector(ours.assign_parameters(params))))**2
    assert fidelity == pytest.approx(1.0, abs=1e-9)


def test_interp_grows_schedule():
    assert np.allclose(_interp(np.array([1.0])), [1.0, 1.0])
    assert np.allclose(_interp(np.array([1.0, 2.0])), [1.0, 1.5, 2.0])


def test_qaoa_finds_optimum_on_clear_instance():
    # Uncorrelated stocks with clearly separated returns: an easy instance for
    # brute force. (Low-depth QAOA still gives the runner-up similar odds.)
    mu = np.array([0.05, 0.40, 0.10, 0.30])
    sigma = np.diag([0.04, 0.06, 0.05, 0.05])
    q = build_qubo(mu, sigma, risk=0.8, k=2)
    bf = brute_force(q)
    res = run_qaoa(q, reps=3, draw=False, seed=1, with_noise=False)
    assert res.noisy is None
    assert res.ideal.best_bitstring == bf.bitstring
    assert res.ideal.most_likely_bitstring == bf.bitstring
    # QAOA should amplify the optimum well above random guessing (1/16).
    assert res.ideal.counts[bf.bitstring] / res.shots > 2 / 16
    assert sum(res.ideal.counts.values()) == res.shots


@pytest.mark.parametrize("seed", range(4))
def test_qaoa_beats_random_guessing(seed):
    mu, sigma = random_instance(4, seed)
    q = build_qubo(mu, sigma, risk=0.5, k=2)
    bf = brute_force(q)
    res = run_qaoa(q, reps=2, draw=False, with_noise=False).ideal
    # Random guessing hits the optimum 1/16 of the time; QAOA should do clearly better.
    shots = sum(res.counts.values())
    assert res.counts.get(bf.bitstring, 0) / shots > 2 / 16
    assert res.best_bitstring == bf.bitstring


def test_noisy_run_uses_same_angles_and_degrades():
    mu, sigma = random_instance(3, seed=0)
    q = build_qubo(mu, sigma, risk=0.5, k=1)
    bf = brute_force(q)
    res = run_qaoa(q, reps=2, draw=False, shots=4096)
    ideal, noisy = res.ideal, res.noisy
    assert sum(noisy.counts.values()) == 4096
    assert all(len(b) == 3 for b in noisy.counts)
    # Hardware wiring + native gates make the compiled circuit bigger...
    assert noisy.two_qubit_gates > ideal.two_qubit_gates
    # ...and noise spreads probability away from the optimum.
    assert noisy.counts.get(bf.bitstring, 0) < ideal.counts.get(bf.bitstring, 0)


def test_circuit_svg_renders():
    mu, sigma = random_instance(3, seed=0)
    res = run_qaoa(build_qubo(mu, sigma, 0.5, 1), reps=1, labels=["NVDA", "AAPL", "MSFT"], with_noise=False)
    assert res.circuit_svg.lstrip().startswith("<?xml") and "NVDA" in res.circuit_svg


def test_one_layer_landscape_matches_qiskit():
    mu, sigma = random_instance(4, seed=5)
    H, _ = build_hamiltonian(build_qubo(mu, sigma, risk=0.6, k=2))
    betas, gammas = np.array([0.0, 0.4, 2.2]), np.array([0.3, 1.7, 4.0, 5.9])
    grid = one_layer_landscape(H, betas, gammas)
    for i, b in enumerate(betas):
        for j, g in enumerate(gammas):
            ref = Statevector(qaoa_ansatz(H, reps=1).assign_parameters([b, g])).probabilities()
            assert np.allclose(grid[i, j], ref, atol=1e-12)


def test_evolution_starts_uniform_and_ends_at_trained_state():
    mu, sigma = random_instance(4, seed=2)
    q = build_qubo(mu, sigma, risk=0.5, k=2)
    res = run_qaoa(q, reps=2, draw=False, with_noise=False)
    assert len(res.evolution) == 3
    assert all(abs(p - 1 / 16) < 1e-12 for p in res.evolution[0].values())
    for stage in res.evolution:
        assert abs(sum(stage.values()) - 1) < 1e-9
    # The final stage is the trained circuit, whose samples we measured.
    final = res.evolution[-1]
    most_likely = max(final, key=final.get)
    assert res.ideal.counts.get(most_likely, 0) > 0


def test_layer_study_compares_one_to_three_layers():
    mu, sigma = random_instance(4, seed=1)
    res = run_qaoa(build_qubo(mu, sigma, risk=0.5, k=2), reps=1, draw=False)
    study = res.layer_study
    assert [e["layers"] for e in study] == [1, 2, 3]
    for e in study:
        assert abs(sum(e["ideal"].values()) - 1) < 1e-9
        assert abs(sum(e["noisy"].values()) - 1) < 1e-9
    # Every extra layer means more operations on the real chip.
    gates = [e["chip_two_qubit_gates"] for e in study]
    assert gates == sorted(gates) and gates[0] < gates[-1]
