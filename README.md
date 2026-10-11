# Quantum Portfolio Lab

**An interactive explainer for QAOA (Quantum Approximate Optimization Algorithm), built around a real finance problem: choosing which stocks to hold.**
Built for the qollab.xyz hackathon, theme **Quantum Unlocked**.

Pick 3–5 stocks and a risk level. The app turns "which *k* stocks should I hold?" into a QUBO, solves it with QAOA on a simulated quantum computer (ideal and noisy), and walks you through every step with plain-English explanations. Every quantum result is shown next to a classical answer key.

> **Honest by design.** With 3–5 stocks there are at most 32 possible portfolios, and a laptop checks them all in under a millisecond. Classical solvers tie or beat QAOA at this size. **We do not claim quantum advantage.** This is a small, teachable version of a *discrete* optimization problem (choosing exactly *k* assets) that researchers hope quantum methods might help with at much larger scales. That has not been demonstrated yet.

> **Not financial advice.** Educational demo using historical prices. Past performance does not predict future returns.

---

## Quick start

Prerequisites: **Python 3.10 or newer**, **Node.js 20+**, and `make` (optional, and usually missing on Windows; use the manual steps below there). No API keys, accounts or database.

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
python3 -m venv .venv              # Windows: python -m venv .venv
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

**Try it on your phone** (same Wi-Fi as your computer): start the backend as above, then run the web app with the `--host` flag so it is reachable on your network:

```bash
npm --prefix web run dev -- --host     # or: cd web && npm run dev -- --host
```

Vite prints a `Network:` address (like `http://192.168.x.x:5173`). Open it in your phone's browser. The phone only talks to the web server, which forwards API calls to the backend on your computer, so you do not need to expose the backend itself. If the page does not load, allow Node through your firewall when prompted.

The first request after a cold start takes a few seconds (Qiskit import, price download, one-time matplotlib font cache). After that, a run takes under 1 second.

---

## What the app shows

The page is written for a curious person who has never heard of QAOA. It teaches the idea first, ties it to a real problem they can play with, then shows why it matters. One term is used throughout: a **portfolio** is a group of stocks you hold (4 stocks → 16 possible portfolios, written as bits like `1100`).

1. **Small choices, enormous numbers.** A calculator with two presets, *your choice* (follows the form) and *50 of the S&P 500* (a 70-digit number). It ends by naming QAOA.
2. **So what is QAOA?** Quantum · Approximate · Optimization · Algorithm, who proposed it, and a one-sentence definition.
3. **How a quantum computer finds good answers.** Superposition, interference and measurement, illustrated with 8 labelled portfolios (`000`–`111`). Interference is explained with **arrows**: the score step turns each portfolio's arrow by its score (which alone changes nothing), and the mix step combines arrows of portfolios one stock apart, so arrows that point the same way add up and opposite ones cancel. Measurement is explained concretely: a 30% chance means about 30 of every 100 runs. A "who does what" box: the quantum computer runs the circuit; a normal computer only picks the settings and adjusts them (hence "hybrid").
4. **What is a quantum circuit?** A labelled 3-stock circuit (start → score → mix → measure) with a caption per step.
5. **Try it on real stocks**, then the result: QAOA's pick as qubits, what "top-scoring" means, and how often it came out vs a random pick.
6. **What if you had invested a year ago?** Growth of an editable amount (default $100,000) for QAOA's pick (split evenly), the classical mix and all your stocks. Labelled clearly as hindsight: the pick used these same prices.
7. **What just happened.** Four short steps: score every portfolio → build the circuit → watch the chances change (real per-layer probabilities, with Play) → measure many times.
8. **More layers, more noise.** 1, 2 and 3 layers on a perfect simulator vs a noisy IBM chip model, with chip operation counts.
9. **Your turn: beat the optimizer.** Two dial sliders (score, mix) for a one-layer circuit; the chance of every portfolio updates instantly (all settings are simulated exactly in advance), with "now / your best / optimizer" scores. A button reveals the full map of settings with your position and the optimizer's.
10. **Quantum vs. classical.** Side by side, plus a risk-vs-return chart.
11. **Why QAOA is exciting.** Three reasons; *Picture a world where it works* (personalised treatment combinations, new materials, self-replanning cities, renewable grids, instant airline recovery, molecule design), labelled as possibilities, not promises; the same recipe written out for finance, delivery, energy, scheduling and networks; and what has to happen first.

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
minimize   (1 − s)/k² · xᵀΣx   −   s/k · μᵀx   +   P · (Σᵢ xᵢ − k)²
            └──── risk ────┘      └ return ┘      └── hold exactly k ──┘
```

- `s` is the risk slider: 0 = only minimize risk, 1 = only maximize return.
- The `1/k²` and `1/k` come from splitting the money evenly over the `k` chosen stocks (`w = x/k`): risk is `wᵀΣw = xᵀΣx/k²` and return is `μᵀw = μᵀx/k`. This keeps the slider meaning the same thing as in the classical (Markowitz) problem for every `k`.
- μ and Σ are each divided by their largest absolute entry, so both terms live on the same scale and the slider behaves smoothly.
- `P` is the smallest penalty that is provably large enough: flipping one bit changes the risk+return part by at most `M` (computed with the `1/k²` and `1/k` weights), so any `P > M` guarantees the best answer holds exactly `k` stocks. A bigger `P` would drown out the finance signal. Details are in [backend/app/services/qubo.py](backend/app/services/qubo.py).

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
- QAOA only decides *which* stocks to hold. Splitting the money is a separate continuous problem that classical solvers handle well, so the UI does not present a split; the risk/return chart plots QAOA's pick with the money split evenly.

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

1. **Hook (20 s).** *Small choices, enormous numbers*: "2 of 4 stocks: 6 options. 50 of the S&P 500: a 70-digit number. Nobody checks everything. One promising quantum strategy is called QAOA."
2. **What QAOA is (15 s).** Read the four letters.
3. **The idea (40 s).** "A portfolio is a group of stocks; with 3 stocks there are 8. A quantum computer holds all 8 at once. Each has an arrow: the score step turns arrows, the mix step combines them, and arrows that line up make a portfolio more likely. The quantum computer does that; a normal computer just tunes the settings."
4. **Real stocks (20 s).** Change a stock or the risk slider and press **Run**. Point at the qubits: 1 = buy, 0 = skip.
5. **The $100k chart (15 s).** "In hindsight, $100k in QAOA's pick a year ago would be worth this. Hindsight only, since it used the same prices."
6. **Inside the circuit (20 s).** *What just happened* → step 3 → **Play**: the real chances changing layer by layer.
7. **Noise (15 s).** "More layers help a perfect machine and hurt a real one."
8. **Your turn (25 s).** Turn the dials, find a bright spot, then **Reveal the map**. "That trial and error is the normal computer's job."
9. **Close (20 s).** *Picture a world where it works*: "At this size a laptop wins, and we say so. If the hardware gets there, this recipe could re-plan cities, grids and airlines."

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

Covers: bad or too-short price data, the result cache, and safe error messages; the QUBO matrix equals the written formula, and its pick matches the best equal-weight portfolio; the penalty always forces exactly *k* stocks (checked on 135 random instances); brute force is truly minimal; the Ising Hamiltonian ranks bitstrings identically to the QUBO; the readable circuit is identical to Qiskit's `qaoa_ansatz` (fidelity 1); QAOA beats random guessing and finds the optimum; noise adds gates and lowers P(optimum); Markowitz and frontier sanity checks; API validation and errors; offline fallback.