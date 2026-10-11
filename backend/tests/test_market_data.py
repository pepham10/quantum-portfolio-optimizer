"""The demo must survive Yahoo Finance being down: check the offline fallback."""

import pytest

from app.services import market_data as md


@pytest.fixture
def network_down(monkeypatch):
    def boom(_tickers):
        raise ConnectionError("no network")

    monkeypatch.setattr(md, "_download", boom)
    monkeypatch.setattr(md, "_memory_cache", {})


def test_falls_back_to_bundled_snapshot(network_down):
    data = md.get_prices(["NVDA", "AAPL", "KO"], lookback_days=365)
    assert data.source == "fallback"
    assert list(data.prices.columns) == ["NVDA", "AAPL", "KO"]
    assert len(data.prices) > 200
    mu, sigma = md.annualized_stats(data.prices)
    assert mu.shape == (3,) and sigma.shape == (3, 3)


def test_every_popular_ticker_has_fallback_data():
    assert set(md.POPULAR_TICKERS) <= set(md._load_fallback())


def test_unknown_ticker_without_network_is_a_clear_error(network_down):
    with pytest.raises(md.TickerNotFoundError, match="AMD"):
        md.get_prices(["NVDA", "AMD", "KO"])


def test_malformed_symbol_rejected():
    with pytest.raises(md.TickerNotFoundError):
        md.normalize_ticker("not a ticker")
    assert md.normalize_ticker(" brk.b ") == "BRK.B"
