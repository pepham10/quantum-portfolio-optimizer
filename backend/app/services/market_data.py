"""Price data and the two statistics the optimizer needs: mu and Sigma.

Data source priority (so a flaky network can never break a live demo):
  1. in-memory cache (per process, refreshed every few hours)
  2. live download from Yahoo Finance via yfinance
  3. a bundled JSON snapshot for popular tickers (app/data/fallback_prices.json)
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

TRADING_DAYS = 252
CACHE_TTL_SECONDS = 6 * 60 * 60
FALLBACK_FILE = Path(__file__).resolve().parent.parent / "data" / "fallback_prices.json"
TICKER_RE = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")

POPULAR_TICKERS = [
    "NVDA", "AAPL", "MSFT", "TSLA", "GOOGL", "AMZN",
    "META", "JPM", "XOM", "KO", "JNJ", "WMT",
]


class TickerNotFoundError(ValueError):
    """Raised when a symbol has no price data from any source."""


@dataclass
class PriceData:
    prices: pd.DataFrame  # index = date, one column per ticker (adjusted close)
    source: str           # "live" | "cache" | "fallback"


# ticker -> (fetched_at, Series of adjusted closes covering ~2 years)
_memory_cache: dict[str, tuple[float, pd.Series]] = {}
_fallback: dict[str, pd.Series] | None = None


def normalize_ticker(symbol: str) -> str:
    sym = symbol.strip().upper()
    if not TICKER_RE.match(sym):
        raise TickerNotFoundError(f"'{symbol}' is not a valid ticker symbol")
    return sym


def _load_fallback() -> dict[str, pd.Series]:
    global _fallback
    if _fallback is None:
        _fallback = {}
        if FALLBACK_FILE.exists():
            raw = json.loads(FALLBACK_FILE.read_text())
            for ticker, series in raw["prices"].items():
                s = pd.Series(series, dtype=float)
                s.index = pd.to_datetime(s.index)
                _fallback[ticker] = s.sort_index()
    return _fallback


def _download(tickers: list[str]) -> dict[str, pd.Series]:
    """Fetch ~2 years of daily adjusted closes. Missing/unknown tickers are omitted."""
    import yfinance as yf  # imported lazily: slow import, and tests can run without network

    df = yf.download(
        tickers, period="2y", auto_adjust=True, progress=False, threads=True, timeout=10
    )
    if df is None or df.empty:
        return {}
    close = df["Close"]
    if isinstance(close, pd.Series):  # single ticker
        close = close.to_frame(tickers[0])
    out = {}
    for t in tickers:
        if t in close.columns:
            s = close[t].dropna()
            if len(s) > 30:
                out[t] = s
    return out


def get_prices(tickers: list[str], lookback_days: int = 365) -> PriceData:
    """Return aligned adjusted-close prices for the last `lookback_days` calendar days."""
    tickers = [normalize_ticker(t) for t in tickers]
    now = time.time()
    series: dict[str, pd.Series] = {}
    sources: set[str] = set()

    for t in tickers:
        hit = _memory_cache.get(t)
        if hit and now - hit[0] < CACHE_TTL_SECONDS:
            series[t] = hit[1]
            sources.add("cache")

    missing = [t for t in tickers if t not in series]
    if missing:
        try:
            fetched = _download(missing)
        except Exception as exc:  # network error, rate limit, yfinance breakage...
            log.warning("yfinance download failed: %s", exc)
            fetched = {}
        for t, s in fetched.items():
            _memory_cache[t] = (now, s)
            series[t] = s
            sources.add("live")

    missing = [t for t in tickers if t not in series]
    if missing:
        fallback = _load_fallback()
        for t in missing:
            if t in fallback:
                series[t] = fallback[t]
                sources.add("fallback")

    missing = [t for t in tickers if t not in series]
    if missing:
        raise TickerNotFoundError(f"No price data found for: {', '.join(missing)}")

    prices = pd.DataFrame({t: series[t] for t in tickers})
    # Strip timezones so live and fallback series align on the same dates.
    prices.index = pd.to_datetime(prices.index).tz_localize(None).normalize()
    cutoff = prices.index.max() - pd.Timedelta(days=lookback_days)
    prices = prices[prices.index >= cutoff].dropna()
    if len(prices) < 30:
        raise TickerNotFoundError("Not enough overlapping price history for these tickers")

    # Report the "weakest" source used so the UI can be honest about staleness.
    source = "fallback" if "fallback" in sources else "live" if "live" in sources else "cache"
    return PriceData(prices=prices, source=source)


def ticker_exists(symbol: str) -> bool:
    try:
        get_prices([symbol], lookback_days=365)
        return True
    except TickerNotFoundError:
        return False


def annualized_stats(prices: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Expected annual returns (mu) and annual covariance matrix (Sigma).

    Both come from simple daily returns, scaled by 252 trading days. These are
    backward-looking estimates; past performance does not predict future returns.
    """
    returns = prices.pct_change().dropna()
    mu = returns.mean().to_numpy() * TRADING_DAYS
    sigma = returns.cov().to_numpy() * TRADING_DAYS
    return mu, sigma
