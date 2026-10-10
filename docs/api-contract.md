# API contract

Base URL: `http://<laptop-ip>:8000`

## GET /api/health
Response: `{ "status": "ok" }`

## POST /api/optimize

Request:
```jsonc
{
  "tickers": ["NVDA", "AAPL", "MSFT"],   // 3-5 symbols
  "risk": 0.7,                            // 0 = conservative, 1 = aggressive
  "lookback_days": 365                    // optional, default 365
}
```

Response:
```jsonc
{
  "tickers": ["NVDA", "AAPL", "MSFT"],
  "risk": 0.7,
  "quantum": {
    "weights": { "NVDA": 0.5, "AAPL": 0.3, "MSFT": 0.2 },   // sums to 1.0
    "expected_return": 0.18,    // annualized, 0.18 = 18%
    "volatility": 0.22,         // annualized
    "runtime_ms": 4200
  },
  "classical": {
    "weights": { "NVDA": 0.4, "AAPL": 0.4, "MSFT": 0.2 },
    "expected_return": 0.19,
    "volatility": 0.21,
    "runtime_ms": 35
  }
}
```

Errors:
- 422: invalid input (bad risk, wrong number of tickers). FastAPI does this automatically.
- 400: ticker not found or no price data
- 500: solver failed
