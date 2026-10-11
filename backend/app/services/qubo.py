r"""Portfolio selection as a QUBO (Quadratic Unconstrained Binary Optimization).

Decision: one binary variable per stock, x_i = 1 means "hold stock i".

    minimize  f(x) = (1 - s) * x^T S x  -  s * m^T x  +  P * (sum_i x_i - k)^2
                     \_____ risk _____/   \_ return _/   \____ budget ______/

  s  risk slider in [0, 1]. s = 0 cares only about risk, s = 1 only about return.
  S  covariance matrix, divided by its largest absolute entry (so entries are in [-1, 1]).
  m  expected returns, divided by their largest absolute value (also in [-1, 1]).
  k  how many stocks to hold.
  P  penalty weight: a big cost for picking any number of stocks other than k.

Why normalize? Annual variances (~0.05) and returns (~0.3) live on different
scales; without rescaling, the slider would not move the answer smoothly.

Why is P chosen as it is? Flipping one bit changes the risk + return part by at
most M = max_i [(1-s) * (S_ii + 2 * sum_{j!=i} |S_ij|) + s * |m_i|]. A bitstring
that is d stocks away from k pays d^2 * P >= d * P in penalty, and can be fixed
with d flips that change the rest by at most d * M. So any P > M guarantees the
best answer holds exactly k stocks, while keeping P as small as possible
(a huge P would drown out the finance signal in the QAOA energy landscape).

Everything here is plain numpy, so the brute-force solver and QAOA are scored
with exactly the same function.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Qubo:
    """f(x) = x^T Q x + c, with Q symmetric and x in {0, 1}^n."""

    Q: np.ndarray
    constant: float
    penalty: float
    k: int
    mu_scaled: np.ndarray
    sigma_scaled: np.ndarray
    risk: float

    @property
    def n(self) -> int:
        return self.Q.shape[0]

    def cost(self, x: np.ndarray) -> float:
        x = np.asarray(x, dtype=float)
        return float(x @ self.Q @ x + self.constant)

    def costs(self, X: np.ndarray) -> np.ndarray:
        """Vectorized cost for a (num_bitstrings, n) 0/1 matrix."""
        X = np.asarray(X, dtype=float)
        return np.einsum("bi,ij,bj->b", X, self.Q, X) + self.constant

    def objective_parts(self, x: np.ndarray) -> dict[str, float]:
        """Split f(x) into its three terms, for explaining the result in the UI."""
        x = np.asarray(x, dtype=float)
        return {
            "risk_term": float((1 - self.risk) * x @ self.sigma_scaled @ x),
            "return_term": float(-self.risk * self.mu_scaled @ x),
            "penalty_term": float(self.penalty * (x.sum() - self.k) ** 2),
        }


def scale(mu: np.ndarray, sigma: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mu = np.asarray(mu, dtype=float)
    sigma = np.asarray(sigma, dtype=float)
    mu_scale = np.max(np.abs(mu)) or 1.0
    sigma_scale = np.max(np.abs(sigma)) or 1.0
    return mu / mu_scale, sigma / sigma_scale


def penalty_weight(mu_s: np.ndarray, sigma_s: np.ndarray, risk: float) -> float:
    off_diag = np.abs(sigma_s).sum(axis=1) - np.abs(np.diag(sigma_s))
    per_flip = (1 - risk) * (np.diag(sigma_s) + 2 * off_diag) + risk * np.abs(mu_s)
    return 1.1 * float(per_flip.max()) + 0.1


def build_qubo(mu: np.ndarray, sigma: np.ndarray, risk: float, k: int) -> Qubo:
    n = len(mu)
    if not 0 <= risk <= 1:
        raise ValueError("risk must be in [0, 1]")
    if not 1 <= k < n:
        raise ValueError("k must be between 1 and n - 1")

    mu_s, sigma_s = scale(mu, sigma)
    P = penalty_weight(mu_s, sigma_s, risk)

    # Expand P * (sum x - k)^2 using x_i^2 = x_i for binary variables:
    #   = P * [ sum_{i != j} x_i x_j  +  (1 - 2k) * sum_i x_i  +  k^2 ]
    # Diagonal entries of Q act as linear terms because x_i^2 = x_i.
    Q = (1 - risk) * sigma_s.copy()
    Q += P * (np.ones((n, n)) - np.eye(n))
    Q[np.diag_indices(n)] += -risk * mu_s + P * (1 - 2 * k)
    constant = P * k * k

    return Qubo(Q=Q, constant=constant, penalty=P, k=k,
                mu_scaled=mu_s, sigma_scaled=sigma_s, risk=risk)


def all_bitstrings(n: int) -> np.ndarray:
    """All 2^n assignments as rows; row b's bit i is x_i (stock i, left to right)."""
    idx = np.arange(2**n)
    return ((idx[:, None] >> np.arange(n - 1, -1, -1)) & 1).astype(int)


def to_bitstring(x) -> str:
    return "".join(str(int(b)) for b in x)


def from_bitstring(bits: str) -> np.ndarray:
    return np.array([int(b) for b in bits], dtype=int)


def to_quadratic_program(qubo: Qubo, names: list[str] | None = None):
    """Same QUBO as a qiskit-optimization QuadraticProgram (used to build the Ising Hamiltonian)."""
    from qiskit_optimization import QuadraticProgram

    names = names or [f"x{i}" for i in range(qubo.n)]
    qp = QuadraticProgram("portfolio_selection")
    for name in names:
        qp.binary_var(name)
    linear = {names[i]: float(qubo.Q[i, i]) for i in range(qubo.n)}
    quadratic = {
        (names[i], names[j]): float(2 * qubo.Q[i, j])
        for i in range(qubo.n) for j in range(i + 1, qubo.n) if qubo.Q[i, j] != 0
    }
    qp.minimize(constant=qubo.constant, linear=linear, quadratic=quadratic)
    return qp
