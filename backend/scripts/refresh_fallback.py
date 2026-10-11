"""Snapshot ~2 years of prices for the popular tickers into app/data/fallback_prices.json.

The app uses this file when Yahoo Finance is unreachable or rate-limits us,
so the live demo always works. Re-run before a demo to refresh it:

    python -m scripts.refresh_fallback
"""

import json
from datetime import date

from app.services.market_data import FALLBACK_FILE, POPULAR_TICKERS, _download


def main() -> None:
    series = _download(POPULAR_TICKERS)
    missing = sorted(set(POPULAR_TICKERS) - set(series))
    if missing:
        raise SystemExit(f"Download failed for {missing}; fallback file not changed")
    payload = {
        "generated": date.today().isoformat(),
        "note": "Daily adjusted close prices from Yahoo Finance via yfinance.",
        "prices": {
            t: {d.strftime("%Y-%m-%d"): round(float(p), 4) for d, p in s.items()}
            for t, s in series.items()
        },
    }
    FALLBACK_FILE.parent.mkdir(parents=True, exist_ok=True)
    FALLBACK_FILE.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"Wrote {len(series)} tickers to {FALLBACK_FILE} ({FALLBACK_FILE.stat().st_size // 1024} kB)")


if __name__ == "__main__":
    main()
