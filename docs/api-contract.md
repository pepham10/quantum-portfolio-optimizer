# API contract

Base URL: `http://localhost:8000` (interactive docs at `/docs`).

Bitstrings are always written in **ticker order, left to right**: for tickers
`[NVDA, AAPL, MSFT, TSLA]`, `"0101"` means hold AAPL and TSLA.

## GET /api/health
Response: `{ "status": "ok" }`

## GET /api/tickers/popular
Response: `["NVDA", "AAPL", "MSFT", ...]`. Bundled offline data exists for these.

## GET /api/tickers/validate/{symbol}
Response: `{ "ticker": "AMD", "valid": true }`

## POST /api/optimize

Request:
```jsonc
{
  "tickers": ["NVDA", "AAPL", "MSFT", "TSLA"], // 3-5 unique symbols (case-insensitive)
  "risk": 0.7,             // 0 = capital preservation, 1 = maximum growth
  "k": 2,                  // optional: stocks to hold, 1..n-1 (default: round(n/2))
  "reps": 2,               // optional: QAOA layers, 1-3 (default 2)
  "include_noise": true,   // optional: also run on a noisy IBM device model (default true)
  "lookback_days": 365,    // optional: 180-730 (default 365)
  "shots": 2048            // optional: 256-8192 (default 2048)
}
```

Response (abridged):
```jsonc
{
  "tickers": ["NVDA", "AAPL", "MSFT", "TSLA"], "risk": 0.7, "k": 2, "reps": 2,
  "data": { "source": "live", "start": "2025-10-09", "end": "2026-10-09", "trading_days": 252 },
  // source: live | cache | fallback (bundled snapshot, used if Yahoo is unreachable)
  "assets": [{ "ticker": "NVDA", "expected_return": 0.25, "volatility": 0.38 }],

  "qubo": { "matrix": [[...]], "constant": 8.1, "penalty": 2.0,
            "mu_scaled": [...], "sigma_scaled": [[...]] },

  "qaoa": {
    "ideal": {                       // AerSimulator, no noise
      "counts": { "0101": 590, "0110": 212 },   // all measured bitstrings
      "bitstring": "0101",           // QAOA's answer: cheapest measured bitstring
      "tickers": ["AAPL", "TSLA"],
      "cost": -1.03,
      "is_optimal": true,            // equals the brute-force optimum?
      "approximation_ratio": 1.0,    // 1 = optimal, 0 = worst valid portfolio
      "most_likely_bitstring": "0101",
      "prob_optimal": 0.29,          // share of shots that hit the optimum
      "amplification": 4.6,          // prob_optimal / (1 / 2^n)
      "valid_fraction": 0.41,        // share of shots holding exactly k stocks
      "expected_cost": -0.2,
      "circuit_depth": 30, "two_qubit_gates": 12,
      "backend": "AerSimulator (ideal)", "runtime_ms": 30
    },
    "noisy": { /* same fields; same circuit and angles on FakeManilaV2. null if include_noise=false */ },
    "shots": 2048,
    "random_guess_prob": 0.0625,     // 1 / 2^n
    "random_valid_fraction": 0.375,  // C(n,k) / 2^n
    "optimal_params": { "beta": [..], "gamma": [..] },
    "history": [ ... ],              // optimizer objective per step
    "circuit_svg": "<?xml ...",      // textbook QAOA circuit, dark theme
    "training_ms": 250,
    "hamiltonian": [{ "pauli": "ZZII", "coeff": 1.0 }]
  },

  "brute_force": {
    "bitstring": "0101", "tickers": ["AAPL", "TSLA"], "cost": -1.03, "runtime_ms": 0.1,
    "ranking": [  // all 2^n bitstrings, best first
      { "bitstring": "0101", "tickers": [..], "cost": -1.03, "valid": true,
        "risk_term": 0.1, "return_term": -1.13, "penalty_term": 0.0 }
    ]
  },

  // Hybrid: classical weights among the stocks QAOA picked (ideal run)
  "quantum":   { "weights": { "NVDA": 0, "AAPL": 0.55, "MSFT": 0, "TSLA": 0.45 },
                 "expected_return": 0.18, "volatility": 0.22, "runtime_ms": 300 },
  // Markowitz mean-variance over all tickers (no "exactly k" rule)
  "classical": { "weights": { ... }, "expected_return": 0.19, "volatility": 0.21, "runtime_ms": 5 },
  "frontier": [{ "volatility": 0.18, "expected_return": 0.12 }],
  "disclaimer": "Educational demo only. ..."
}
```

Errors:
- 422: invalid input (risk out of range, 3-5 tickers, duplicates, bad k/reps). Automatic from FastAPI.
- 400: ticker not found or no price data.
- 500: solver failed.
