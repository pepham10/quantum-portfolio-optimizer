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
NEGATIVE_TTL_SECONDS = 10 * 60  # remember "this symbol does not exist" so we don't re-ask Yahoo
MIN_HISTORY_DAYS = 120  # trading days of overlapping prices; fewer makes mu and Sigma mostly noise
FALLBACK_FILE = Path(__file__).resolve().parent.parent / "data" / "fallback_prices.json"
TICKER_RE = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")

POPULAR_TICKERS = [
    "NVDA", "AAPL", "MSFT", "TSLA", "GOOGL", "AMZN",
    "META", "JPM", "XOM", "KO", "JNJ", "WMT",
]


class TickerNotFoundError(ValueError):
    """Raised when a symbol has no price data from any source."""


class DataQualityError(TickerNotFoundError):
    """Raised when prices exist but are unusable (too short, corrupt). Maps to a 400, like a bad ticker."""


@dataclass
class PriceData:
    prices: pd.DataFrame  # index = date, one column per ticker (adjusted close)
    source: str           # "live" | "cache" | "fallback"


# ticker -> (fetched_at, Series of adjusted closes covering ~2 years)
_memory_cache: dict[str, tuple[float, pd.Series]] = {}
_fallback: dict[str, pd.Series] | None = None
# symbol -> time we learned Yahoo has no data for it (only recorded when the download itself worked)
_unknown: dict[str, float] = {}


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
    known_bad = [t for t in missing if now - _unknown.get(t, 0.0) < NEGATIVE_TTL_SECONDS and t not in _load_fallback()]
    if known_bad:
        raise TickerNotFoundError(f"No price data found for: {', '.join(known_bad)}")
    download_ok = False
    if missing:
        try:
            fetched = _download(missing)
            download_ok = True
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
        if download_ok:  # Yahoo answered and these symbols are not in it: remember that for a while
            for t in missing:
                _unknown[t] = now
        raise TickerNotFoundError(f"No price data found for: {', '.join(missing)}")

    prices = pd.DataFrame({t: series[t] for t in tickers})
    # Strip timezones so live and fallback series align on the same dates.
    prices.index = pd.to_datetime(prices.index).tz_localize(None).normalize()
    # Zero or negative prices are bad data and would make returns infinite or NaN; treat them as missing.
    prices = prices.where(prices > 0)
    cutoff = prices.index.max() - pd.Timedelta(days=lookback_days)
    prices = prices[prices.index >= cutoff].dropna()
    if len(prices) < MIN_HISTORY_DAYS:
        raise DataQualityError(
            f"Not enough overlapping price history: found {len(prices)} trading days, need at least "
            f"{MIN_HISTORY_DAYS}. A recently listed stock can cause this; try different tickers or a longer lookback."
        )

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
    if not (np.isfinite(mu).all() and np.isfinite(sigma).all()):
        raise DataQualityError("The price data for these tickers contains invalid values; try different tickers.")
    return mu, sigma