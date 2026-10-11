"""API tests with synthetic prices, so they run offline and deterministically."""

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import market_data, optimizer

client = TestClient(app)


def fake_get_prices(tickers, lookback_days=365):
    unknown = [t for t in tickers if t.startswith("BAD")]
    if unknown:
        raise market_data.TickerNotFoundError(f"No price data found for: {', '.join(unknown)}")
    rng = np.random.default_rng(0)
    dates = pd.bdate_range(end="2026-10-09", periods=252)
    drifts = np.linspace(0.0002, 0.0015, len(tickers))
    vols = np.linspace(0.01, 0.03, len(tickers))
    rets = rng.normal(drifts, vols, size=(len(dates), len(tickers)))
    prices = pd.DataFrame(100 * np.cumprod(1 + rets, axis=0), index=dates, columns=tickers)
    return market_data.PriceData(prices=prices, source="fallback")


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setattr(optimizer, "get_prices", fake_get_prices)


def test_optimize_full_response():
    r = client.post("/api/optimize", json={"tickers": ["nvda", "AAPL", "MSFT", "TSLA"], "risk": 0.6, "reps": 1})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tickers"] == ["NVDA", "AAPL", "MSFT", "TSLA"]
    assert body["k"] == 2
    qaoa, bf = body["qaoa"], body["brute_force"]
    assert qaoa["random_guess_prob"] == 1 / 16
    assert qaoa["random_valid_fraction"] == 6 / 16
    assert qaoa["circuit_svg"].lstrip().startswith("<?xml")
    for run in (qaoa["ideal"], qaoa["noisy"]):
        assert len(run["bitstring"]) == 4
        assert sum(run["counts"].values()) == qaoa["shots"]
        assert run["is_optimal"] == (run["bitstring"] == bf["bitstring"])
    q = qaoa["ideal"]
    assert q["bitstring"].count("1") == 2
    assert 0 <= q["approximation_ratio"] <= 1
    assert qaoa["noisy"]["backend"] == "FakeManilaV2"
    assert len(bf["ranking"]) == 16 and bf["ranking"][0]["bitstring"] == bf["bitstring"]
    # Hybrid weights only on QAOA's chosen stocks.
    chosen = set(q["tickers"])
    assert all(w == 0 for t, w in body["quantum"]["weights"].items() if t not in chosen)
    assert sum(body["quantum"]["weights"].values()) == pytest.approx(1, abs=1e-3)
    assert sum(body["classical"]["weights"].values()) == pytest.approx(1, abs=1e-3)
    assert len(body["frontier"]) > 5
    land = body["landscape"]
    assert len(land["probs"]) == len(land["betas"]) and len(land["probs"][0]) == len(land["gammas"])
    assert len(land["order"]) == 6 and land["order"][0] == bf["bitstring"]
    assert abs(sum(land["probs"][3][7]) - 1) < 1e-3
    assert len(qaoa["evolution"]) == body["reps"] + 1
    bt = body["backtest"]
    assert bt["qaoa"][0] == pytest.approx(1) and len(bt["dates"]) == len(bt["markowitz"]) == len(bt["all_equal"])
    assert body["data"]["source"] == "fallback"
    assert "Not financial advice" in body["disclaimer"]


@pytest.mark.parametrize("payload", [
    {"tickers": ["AAPL", "MSFT"], "risk": 0.5},                               # too few
    {"tickers": ["A", "B", "C", "D", "E", "F"], "risk": 0.5},                 # too many
    {"tickers": ["AAPL", "aapl", "MSFT"], "risk": 0.5},                       # duplicates
    {"tickers": ["AAPL", "MSFT", "NVDA"], "risk": 1.5},                       # risk out of range
    {"tickers": ["AAPL", "MSFT", "NVDA"], "risk": 0.5, "k": 3},               # k must be < n
    {"tickers": ["AAPL", "MSFT", "NVDA"], "risk": 0.5, "reps": 4},            # too many layers
])
def test_invalid_requests_422(payload):
    assert client.post("/api/optimize", json=payload).status_code == 422


def test_noise_can_be_skipped():
    r = client.post("/api/optimize", json={"tickers": ["A", "B", "C"], "risk": 0.5, "reps": 1, "include_noise": False})
    assert r.status_code == 200 and r.json()["qaoa"]["noisy"] is None


def test_unknown_ticker_400():
    r = client.post("/api/optimize", json={"tickers": ["AAPL", "MSFT", "BADX"], "risk": 0.5})
    assert r.status_code == 400
    assert "BADX" in r.json()["detail"]


def test_popular_tickers():
    assert "NVDA" in client.get("/api/tickers/popular").json()


def test_validate_rejects_malformed_symbol():
    assert client.get("/api/tickers/validate/not a ticker!").json()["valid"] is False
