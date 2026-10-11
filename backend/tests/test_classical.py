import numpy as np
import pandas as pd
import pytest

from app.services.classical_solver import efficient_frontier, markowitz_weights, portfolio_stats
from app.services.market_data import annualized_stats


def test_annualized_stats():
    # Asset A grows exactly 0.1% per day; B alternates +1% / -1%.
    days = 253
    a = 100 * 1.001 ** np.arange(days)
    b = 100 * np.cumprod([1.0] + [1.01 if i % 2 == 0 else 0.99 for i in range(days - 1)])
    mu, sigma = annualized_stats(pd.DataFrame({"A": a, "B": b}))
    assert mu[0] == pytest.approx(0.001 * 252)
    assert sigma[0, 0] == pytest.approx(0, abs=1e-12)
    assert sigma[1, 1] == pytest.approx(0.01**2 * 252, rel=0.01)


def test_markowitz_weights_valid(instance):
    mu, sigma = instance
    for risk in (0.0, 0.5, 1.0):
        w = markowitz_weights(mu, sigma, risk)
        assert w.sum() == pytest.approx(1)
        assert (w >= 0).all()


def test_markowitz_extremes(instance):
    mu, sigma = instance
    w_growth = markowitz_weights(mu, sigma, 1.0)
    assert w_growth[np.argmax(mu)] == pytest.approx(1, abs=1e-3)
    # Risk-averse portfolio should be (nearly) the least volatile on the frontier.
    _, vol_safe = portfolio_stats(markowitz_weights(mu, sigma, 0.0), mu, sigma)
    frontier = efficient_frontier(mu, sigma)
    assert vol_safe <= min(p["volatility"] for p in frontier) + 1e-3


def test_frontier_is_monotonic(instance):
    mu, sigma = instance
    f = efficient_frontier(mu, sigma, points=15)
    assert len(f) >= 10
    rets = [p["expected_return"] for p in f]
    vols = [p["volatility"] for p in f]
    assert rets == sorted(rets)
    assert all(v2 >= v1 - 1e-4 for v1, v2 in zip(vols, vols[1:]))
