"""Classical baselines.

1. brute_force(): checks all 2^n bitstrings of the QUBO. Exact, and instant for
   n <= 5 (32 bitstrings). This is the "answer key" QAOA is graded against.
2. markowitz_weights(): classic mean-variance optimization with continuous,
   long-only weights. Uses the same risk/return trade-off as the QUBO, minus
   the "exactly k stocks" rule.
3. efficient_frontier(): lowest-volatility portfolio for each target return.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize

from app.services.qubo import Qubo, all_bitstrings, scale, to_bitstring


@dataclass
class BruteForceResult:
    bitstring: str
    cost: float
    all_costs: dict[str, float]  # every bitstring -> QUBO cost
    worst_cost: float
    runtime_ms: float


def brute_force(qubo: Qubo) -> BruteForceResult:
    t0 = time.perf_counter()
    X = all_bitstrings(qubo.n)
    costs = qubo.costs(X)
    best = int(np.argmin(costs))
    return BruteForceResult(
        bitstring=to_bitstring(X[best]),
        cost=float(costs[best]),
        all_costs={to_bitstring(x): float(c) for x, c in zip(X, costs)},
        worst_cost=float(costs.max()),
        runtime_ms=(time.perf_counter() - t0) * 1000,
    )


def portfolio_stats(weights: np.ndarray, mu: np.ndarray, sigma: np.ndarray) -> tuple[float, float]:
    """(expected annual return, annual volatility) of a weighted portfolio."""
    w = np.asarray(weights, dtype=float)
    return float(w @ mu), float(np.sqrt(max(w @ sigma @ w, 0.0)))


def markowitz_weights(mu: np.ndarray, sigma: np.ndarray, risk: float) -> np.ndarray:
    """Long-only weights minimizing (1 - s) * w^T S w - s * m^T w, with sum(w) = 1.

    S and m are scaled exactly like in the QUBO, so the slider means the same thing
    for both the binary (quantum) and continuous (classical) problem.
    """
    n = len(mu)
    mu_s, sigma_s = scale(mu, sigma)

    def objective(w):
        return (1 - risk) * w @ sigma_s @ w - risk * mu_s @ w

    def gradient(w):
        return 2 * (1 - risk) * sigma_s @ w - risk * mu_s

    res = minimize(
        objective, np.full(n, 1 / n), jac=gradient, method="SLSQP",
        bounds=[(0, 1)] * n,
        constraints=[{"type": "eq", "fun": lambda w: w.sum() - 1, "jac": lambda w: np.ones(n)}],
    )
    w = np.clip(res.x, 0, None)
    w[w < 1e-4] = 0
    return w / w.sum()


def min_variance_for_return(mu: np.ndarray, sigma: np.ndarray, target: float) -> np.ndarray | None:
    n = len(mu)
    res = minimize(
        lambda w: w @ sigma @ w, np.full(n, 1 / n), jac=lambda w: 2 * sigma @ w,
        method="SLSQP", bounds=[(0, 1)] * n,
        constraints=[
            {"type": "eq", "fun": lambda w: w.sum() - 1},
            {"type": "eq", "fun": lambda w: w @ mu - target},
        ],
    )
    return res.x if res.success else None


def efficient_frontier(mu: np.ndarray, sigma: np.ndarray, points: int = 30) -> list[dict]:
    """Points (volatility, return) on the long-only efficient frontier.

    Starts at the global minimum-variance portfolio: anything below it on the
    return axis is inefficient (more risk for less return), so it is skipped.
    """
    n = len(mu)
    res = minimize(
        lambda w: w @ sigma @ w, np.full(n, 1 / n), method="SLSQP",
        bounds=[(0, 1)] * n, constraints=[{"type": "eq", "fun": lambda w: w.sum() - 1}],
    )
    min_ret = float(res.x @ mu)
    frontier = []
    for target in np.linspace(min_ret, float(mu.max()), points):
        w = min_variance_for_return(mu, sigma, target)
        if w is None:
            continue
        ret, vol = portfolio_stats(w, mu, sigma)
        frontier.append({"volatility": vol, "expected_return": ret})
    return frontier


def growth_curve(prices, weights: np.ndarray, every: int = 5) -> tuple[list[str], list[float]]:
    """Value of 1.0 invested at the first date with these weights (bought once, then held).

    Sampled every `every` trading days (plus the last day) to keep the response small.
    """
    w = np.asarray(weights, dtype=float)
    rel = prices.to_numpy() / prices.to_numpy()[0]  # each stock's price relative to day one
    value = rel @ w
    idx = list(range(0, len(value), every))
    if idx[-1] != len(value) - 1:
        idx.append(len(value) - 1)
    dates = [prices.index[i].date().isoformat() for i in idx]
    return dates, [round(float(value[i]), 5) for i in idx]
