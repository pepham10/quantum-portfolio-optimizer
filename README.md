# QAOA Portfolio Lab

**An interactive explainer for QAOA (Quantum Approximate Optimization Algorithm), built around a real finance problem: choosing which stocks to hold.**
Built for the qollab.xyz hackathon, theme **Quantum Unlocked**.

Pick 3–5 stocks and a risk level. The app turns "which *k* stocks should I hold?" into a QUBO, solves it with QAOA on a simulated quantum computer (ideal and noisy), and walks you through every step with plain-English explanations. Every quantum result is shown next to a classical answer key.

> **Honest by design.** With 3–5 stocks there are at most 32 possible portfolios, and a laptop checks them all in under a millisecond. Classical solvers tie or beat QAOA at this size. **We do not claim quantum advantage.** This is a small, teachable version of a *discrete* optimization problem (choosing exactly *k* assets) that researchers hope quantum methods might help with at much larger scales. That has not been demonstrated yet.

> **Not financial advice.** Educational demo using historical prices. Past performance does not predict future returns.

---

## Quick start

Prerequisites: **Python 3.12** (3.10–3.12 work; brand-new Python versions often lack `qiskit-aer` wheels), **Node.js 20+**, and `make` (optional). No API keys, accounts or database.

```bash
make setup      # creates backend/.venv, installs Python + npm packages
make backend    # terminal 1: FastAPI on http://localhost:8000 (docs at /docs)
make web        # terminal 2: React app on http://localhost:5173
make test       # backend tests + frontend production build
```

<details>
<summary>Without make (macOS/Linux, or Git Bash on Windows)</summary>

```bash
# backend
cd backend
python3.12 -m venv .venv
source .venv/bin/activate          # Git Bash on Windows: source .venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# frontend (new terminal)
cd web
npm install
npm run dev
```
</details>

The web dev server forwards `/api/*` to the backend on port 8000, so no CORS setup is needed. To point the frontend somewhere else, set `VITE_API_URL`.

The first request after a cold start takes a few seconds (Qiskit import, price download, one-time matplotlib font cache). After that, a run takes under 1 second.

---

## What the app shows

The page is written for someone who has never heard of QAOA. It runs once on load with four default stocks, so there is always something to look at.

1. **Setup.** Pick 3–5 stocks and a risk level (safer ↔ more growth). "Stocks to hold" and "circuit layers" sit under *Advanced options*.
2. **Result.** One sentence: *"Hold NVDA and AAPL"*, whether that matches the exact best answer, how often the quantum computer produced it compared with random guessing, and the suggested money split.
3. **How it got there.** A four-step walkthrough, with Back/Next buttons and one simple visual per step:
   1. *Score every choice*: the scoring rule in plain words, and every valid group ranked.
   2. *Turn stocks into qubits*: the Qiskit circuit, with a three-item legend (start, score, mix).
   3. *Measure many times*: how often each group came out of 2,048 runs, with a random-guess marker.
   4. *Add real-world noise*: the same bars from a perfect simulator and a noisy IBM chip model, side by side.
4. **Quantum vs. classical.** The quantum pick, the exact check-every-option answer and classical portfolio math (Markowitz) side by side with their run times, plus a risk-vs-return chart with the efficient frontier.
5. **Honest note.** "Is this a quantum advantage? No, and that's the point."

---

## Architecture

```
 React + Vite (web/)                         FastAPI (backend/)
 ┌──────────────────────┐   POST /api/optimize   ┌───────────────────────────────────────────────┐
 │ ticker picker, risk  │ ─────────────────────▶ │ market_data.py  yfinance → μ, Σ               │
 │ slider, k, layers    │                        │                 (memory cache → live → JSON   │
 │                      │                        │                  snapshot fallback)           │
 │ chapters 01–06       │ ◀───────────────────── │ qubo.py         μ, Σ, risk, k → QUBO matrix   │
 │ Recharts histogram + │      one JSON blob     │ classical_solver.py  brute force, Markowitz,  │
 │ frontier, circuit SVG│                        │                 efficient frontier            │
 └──────────────────────┘                        │ quantum_solver.py  QUBO → Ising → QAOA        │
                                                 │                 (Qiskit + Aer, ideal & noisy) │
                                                 │ optimizer.py    glues it into one response    │
                                                 └───────────────────────────────────────────────┘
```

Stateless: every request is a fresh calculation, with no database. The API shape is documented in [docs/api-contract.md](docs/api-contract.md).

---

## The math, simply

### 1. From prices to μ and Σ
From roughly one year of daily adjusted closing prices we compute daily returns, then annualize (×252 trading days):
- **μ** (mu): each stock's average yearly return
- **Σ** (sigma): the covariance matrix, i.e. how much stocks swing, alone and together

### 2. The QUBO
One binary variable per stock: `xᵢ = 1` means "hold stock *i*".

```
minimize   (1 − s) · xᵀΣx   −   s · μᵀx   +   P · (Σᵢ xᵢ − k)²
            └── risk ──┘      └ return ┘      └── hold exactly k ──┘
```

- `s` is the risk slider: 0 = only minimize risk, 1 = only maximize return.
- μ and Σ are each divided by their largest absolute entry, so both terms live on the same scale and the slider behaves smoothly.
- `P` is the smallest penalty that is provably large enough: flipping one bit changes the risk+return part by at most `M`, so any `P > M` guarantees the best answer holds exactly `k` stocks. A bigger `P` would drown out the finance signal. Details are in [backend/app/services/qubo.py](backend/app/services/qubo.py).

### 3. QUBO → qubits
Substituting `xᵢ = (1 − Zᵢ)/2` turns the cost into an **Ising Hamiltonian** made of `Zᵢ` and `ZᵢZⱼ` terms (qiskit-optimization does the algebra). Low energy means a good portfolio.

### 4. QAOA
1. `H` on every qubit puts all 2ⁿ portfolios in equal superposition.
2. Repeat `p` layers (1–3):
   - **cost layer** `e^(−iγH)`: `RZ` gates (single-stock terms) and `RZZ` gates (covariance and penalty pairs) rotate each portfolio's phase by its cost;
   - **mixer** `e^(−iβΣX)`: `RX` gates let amplitude flow between portfolios so the phases interfere.
3. Measure 2,048 times and keep the **cheapest bitstring seen**. This is the standard QAOA readout: each sample's cost can be checked classically.

Finding the angles γ, β is a classical job (the hybrid loop):
- **Coarse grid + COBYLA.** The 1-layer landscape is bumpy, so we scan a 16×8 grid of (γ, β) and polish the 3 best points with COBYLA.
- **INTERP warm start.** Each extra layer starts from an interpolated schedule (Zhou et al., 2020) or from "previous angles + an off layer", whichever is better, so deeper circuits never start out worse.
- **CVaR objective (α = 0.5).** Angles are scored by the average cost of their best half of outcomes (Barkoutsos et al., 2020). The plain average is dominated by the penalty and happily spreads probability evenly across all valid portfolios.
- On the simulator the objective is computed **exactly from the statevector** (fast and noise-free). Real hardware would have to estimate it from shots.

### 5. Noise
The trained circuit, with the **same angles**, is also run on `AerSimulator.from_backend(FakeManilaV2())`, a noise model of a real 5-qubit IBM device (gate errors, T1/T2 decay, readout errors, and its limited qubit wiring). The compiler adds SWAP gates for that wiring; for 5 stocks and 2 layers the two-qubit gate count goes from 20 to about 90. Any difference between the ideal and noisy histograms is caused only by noise.

### 6. Classical baselines
- **Brute force** over all 2ⁿ bitstrings of the same QUBO: the exact optimum (the answer key).
- **Markowitz** mean-variance with continuous long-only weights (scipy SLSQP), using the same risk/return trade-off but without the "exactly *k*" rule.
- **Efficient frontier**: the minimum-volatility portfolio for each target return.
- **Hybrid step**: after QAOA picks *which* stocks, Markowitz decides *how much* of each.

---

## Honest limitations

- **No speedup.** 3–5 qubits means 8–32 portfolios. Brute force takes microseconds.
- **Low-depth QAOA struggles to rank the valid portfolios.** It quickly learns the "hold *k*" rule (most shots land on valid portfolios), but next to the big penalty the risk/return differences are small, so the best and second-best portfolio often get similar probability. You will sometimes see a most-likely outcome that is not the optimum, and the UI says so. We measured this across many instances while building the app; it is a real property of the algorithm at this depth, not a bug.
- **Everything is simulated.** The noisy mode imitates a retired IBM device; real hardware queues and calibration drift are not modelled.
- **Angles are trained on the ideal simulator, using exact statevector expectations.** On hardware you would train from noisy shot estimates, which is slower and harder.
- **Finance caveats.** μ and Σ from one year of history are noisy estimates; a high past return is not a forecast. No transaction costs, taxes or short selling.
- **Constraint-preserving mixers** (XY mixer + Dicke start state) are a known improvement for "exactly *k*" problems. We prototyped one; it helped some instances and hurt others, at the cost of much deeper circuits, so it is left as future work.

---

## Demo script (about 3 minutes)

1. **Hook (15 s).** "Fund managers often must hold exactly *k* assets. That makes portfolio choice a discrete puzzle, the kind of problem quantum computers are hoped to help with. Let's see how QAOA, the best-known quantum algorithm for this, actually works."
2. **Setup (20 s).** Select NVDA, AAPL, MSFT, TSLA. Risk 0.5, hold 2, p=2. Press **Run QAOA**.
3. **Chapter 01 (30 s).** "Each stock is a qubit; 1 = buy. QAOA picked these two, and it matches the brute-force optimum. But notice: the quantum computer gives *odds*, not an answer. The best portfolio came up X× more often than random guessing."
4. **Chapter 02 (25 s).** Point at the coloured formula. "Risk, return, and a penalty for not holding exactly two. This cost becomes the energy of the circuit."
5. **Chapter 03 (25 s).** "Hadamards make every portfolio possible at once. Pink RZZ gates encode how stocks move together; yellow RX gates make the possibilities interfere. A classical optimizer tunes γ and β: that's the hybrid loop."
6. **Chapter 04 (35 s).** Show the histogram, then click **Compare**. "Same circuit, same angles, on a noisy model of a real IBM chip. The device can't connect every qubit, so the compiler adds swaps, roughly 4× the two-qubit gates, and the peak flattens."
7. **Chapter 05 (20 s).** "Markowitz, the classical standard, lands right next to our hybrid answer, in a millisecond."
8. **Close (15 s).** "So: no quantum advantage here, and we say that plainly. What you've seen is exactly how QAOA works, its real limits today, and why people are still studying it." Optionally drag risk to 0 then 1 and re-run to show the pick moving from steady stocks to fast growers.

**Backup:** if the venue Wi-Fi is down, the 12 popular tickers still work from the bundled snapshot (the UI shows "offline snapshot"). Run `make refresh-data` the night before to update it.

---

## Project structure

```
backend/
  app/
    main.py                      FastAPI app + CORS
    api/routes/portfolio.py      /api/optimize, /api/tickers/*
    schemas/portfolio.py         request/response models (validation: 3–5 tickers, risk 0–1, ...)
    services/
      market_data.py             yfinance + cache + offline fallback, μ and Σ
      qubo.py                    QUBO construction (math documented inline)
      classical_solver.py        brute force, Markowitz, efficient frontier
      quantum_solver.py          QAOA: circuit, angle search, ideal/noisy runs, circuit SVG
      optimizer.py               orchestrates one request
    data/fallback_prices.json    ~2 years of prices for 12 popular tickers
  scripts/refresh_fallback.py    regenerate the snapshot
  tests/                         QUBO, brute force, QAOA vs brute force, noise, API, fallback
web/
  src/App.tsx                    layout, run/loading/error states
  src/components/                Controls + one component per chapter
docs/api-contract.md             request/response shapes
mobile/                          original Expo starter (unused; the demo uses web/)
```

## Tests

```bash
cd backend && .venv/bin/python -m pytest -q
```

Covers: the QUBO matrix equals the written formula; the penalty always forces exactly *k* stocks (checked on 135 random instances); brute force is truly minimal; the Ising Hamiltonian ranks bitstrings identically to the QUBO; the readable circuit is identical to Qiskit's `qaoa_ansatz` (fidelity 1); QAOA beats random guessing and finds the optimum; noise adds gates and lowers P(optimum); Markowitz and frontier sanity checks; API validation and errors; offline fallback.
