"""Guard clauses: bad price data, short history, the result cache, and safe error messages."""

import time

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.api.routes import portfolio as routes
from app.main import app
from app.services import market_data as md
from app.services.qubo import all_bitstrings, build_qubo, scale
from app.services.classical_solver import brute_force

client = TestClient(app, raise_server_exceptions=False)
DAYS = pd.bdate_range(end="2026-10-09", periods=300)


def walk(seed: int, length: int = 300) -> pd.Series:
    rng = np.random.default_rng(seed)
    return pd.Series(100 * np.exp(np.cumsum(rng.normal(0.0004, 0.02, length))), index=DAYS[-length:])


@pytest.fixture
def market(monkeypatch):
    """Fake in-memory prices for AAA, BBB, CCC, so no network is needed."""
    cache = {t: (time.time(), walk(i)) for i, t in enumerate(["AAA", "BBB", "CCC"])}
    monkeypatch.setattr(md, "_memory_cache", cache)
    monkeypatch.setattr(md, "_unknown", {})
    monkeypatch.setattr(routes, "_results", routes.OrderedDict())
    return cache


def test_zero_price_is_a_clear_400_not_a_crash(market):
    bad = walk(9)
    bad.iloc[100] = 0.0
    market["BBB"] = (time.time(), bad)
    r = client.post("/api/optimize", json={"tickers": ["AAA", "BBB", "CCC"], "include_noise": False})
    assert r.status_code == 200  # the zero row is dropped, the rest of the history is fine
    assert r.json()["data"]["trading_days"] < 300


def test_all_bad_prices_give_400(market):
    market["BBB"] = (time.time(), pd.Series(-5.0, index=DAYS))
    r = client.post("/api/optimize", json={"tickers": ["AAA", "BBB", "CCC"], "include_noise": False})
    assert r.status_code == 400
    assert "price history" in r.json()["detail"]


def test_short_history_is_rejected(market):
    market["CCC"] = (time.time(), walk(5, length=60))
    r = client.post("/api/optimize", json={"tickers": ["AAA", "BBB", "CCC"], "include_noise": False})
    assert r.status_code == 400
    assert str(md.MIN_HISTORY_DAYS) in r.json()["detail"]


def test_non_finite_stats_are_rejected():
    prices = pd.DataFrame({"A": [1.0, np.inf, 2.0, 3.0], "B": [1.0, 2.0, 3.0, 4.0]})
    with pytest.raises(md.DataQualityError):
        md.annualized_stats(prices)


def test_unknown_symbol_is_remembered_and_not_re_downloaded(monkeypatch):
    calls = {"n": 0}

    def empty_download(_tickers):
        calls["n"] += 1
        return {}

    monkeypatch.setattr(md, "_download", empty_download)
    monkeypatch.setattr(md, "_memory_cache", {})
    monkeypatch.setattr(md, "_unknown", {})
    for _ in range(4):
        with pytest.raises(md.TickerNotFoundError):
            md.get_prices(["NOTREAL"])
    assert calls["n"] == 1


def test_network_failure_is_not_remembered_as_unknown_symbol(monkeypatch):
    def boom(_tickers):
        raise ConnectionError("offline")

    monkeypatch.setattr(md, "_download", boom)
    monkeypatch.setattr(md, "_memory_cache", {})
    monkeypatch.setattr(md, "_unknown", {})
    with pytest.raises(md.TickerNotFoundError):
        md.get_prices(["NOTREAL"])
    assert "NOTREAL" not in md._unknown


def test_validate_does_not_echo_huge_input():
    r = client.get("/api/tickers/validate/" + "a" * 5000)
    assert r.status_code == 200
    assert r.json()["valid"] is False
    assert len(r.json()["ticker"]) <= 12


def test_identical_requests_are_served_from_cache(market, monkeypatch):
    runs = {"n": 0}
    real = routes.optimize

    def counting(req):
        runs["n"] += 1
        return real(req)

    monkeypatch.setattr(routes, "optimize", counting)
    body = {"tickers": ["AAA", "BBB", "CCC"], "include_noise": False}
    first = client.post("/api/optimize", json=body)
    second = client.post("/api/optimize", json=body)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert runs["n"] == 1
    client.post("/api/optimize", json={**body, "risk": 0.9})  # different request: runs again
    assert runs["n"] == 2


def test_unexpected_errors_do_not_leak_details(market, monkeypatch):
    def explode(_req):
        raise RuntimeError("secret internal detail /home/user/file.py")

    monkeypatch.setattr(routes, "optimize", explode)
    r = client.post("/api/optimize", json={"tickers": ["AAA", "BBB", "CCC"]})
    assert r.status_code == 500
    assert "secret" not in r.text


def test_qubo_pick_matches_best_equal_weight_portfolio():
    """The slider must mean the same for the binary QUBO and equal-weight Markowitz-style scoring."""
    rng = np.random.default_rng(7)
    for _ in range(60):
        n, k = int(rng.integers(3, 6)), None
        k = int(rng.integers(1, n))
        s = float(rng.choice([0.1, 0.3, 0.5, 0.7, 0.9]))
        A = rng.normal(size=(n, n + 3)) * 0.2
        sigma = A @ A.T / (n + 3) * 63 + np.eye(n) * 0.02
        mu = rng.normal(0.15, 0.2, n)
        pick = brute_force(build_qubo(mu, sigma, s, k)).bitstring
        mu_s, sg_s = scale(mu, sigma)
        best = min(
            (x for x in all_bitstrings(n) if x.sum() == k),
            key=lambda x: (1 - s) * (x / k) @ sg_s @ (x / k) - s * mu_s @ (x / k),
        )
        assert pick == "".join(map(str, best))

# ---------------- start-up warm-up ----------------
def test_warm_up_fills_the_result_cache(monkeypatch):
    fake = {t: (time.time(), walk(i)) for i, t in enumerate(["NVDA", "AAPL", "MSFT", "TSLA"])}
    monkeypatch.setattr(md, "_memory_cache", fake)
    monkeypatch.setattr(md, "_unknown", {})
    monkeypatch.setattr(routes, "_results", routes.OrderedDict())
    routes.warm_up()
    assert len(routes._results) == 1


def test_warm_up_never_raises(monkeypatch):
    def explode(_req):
        raise RuntimeError("boom")

    monkeypatch.setattr(routes, "optimize", explode)
    monkeypatch.setattr(routes, "_results", routes.OrderedDict())
    routes.warm_up()  # must swallow the error


@pytest.mark.parametrize("enabled", [True, False])
def test_startup_runs_warm_up_only_when_enabled(monkeypatch, enabled):
    import threading

    from app.core.config import settings

    called = threading.Event()
    monkeypatch.setattr(routes, "warm_up", called.set)
    monkeypatch.setattr(settings, "warmup", enabled)
    with TestClient(app):
        assert called.wait(timeout=2) is enabled