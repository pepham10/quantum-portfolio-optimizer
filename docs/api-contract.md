# API contract (frontend <-> backend)

Agree on this FIRST so both of you can work in parallel.

## POST /api/optimize
Request:  { "tickers": ["NVDA", "AAPL", "MSFT"], "risk": 0.7 }
Response: { "weights": { "NVDA": 0.5, "AAPL": 0.3, "MSFT": 0.2 }, ... }

(TODO: fill in the real shape, including classical vs quantum comparison fields)
