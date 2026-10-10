# Quantum Portfolio Optimizer

Pick 3-5 stocks and a risk level; a QAOA-based optimizer (Qiskit) suggests a portfolio split.

## Stack
- **mobile/**: React Native + TypeScript + Expo
- **backend/**: Python + FastAPI, yfinance, pandas/numpy, Qiskit (QUBO + QAOA on AerSimulator)
- No database. Every request is a one-off calculation.

## Prerequisites
- **Git**
- **Python 3.10+** (developed on 3.14; if `pip install` fails on `qiskit-aer`, try Python 3.12)
- **Node.js 20+ (LTS)**
- **Expo Go** app on your phone (iOS/Android), with the phone on the same Wi-Fi as your laptop. Or use the browser: press `w` after `npx expo start`.
- No API keys or accounts needed. Everything runs locally.

## Setup

```bash
git clone https://github.com/pepham10/quantum-portfolio-optimizer.git
cd quantum-portfolio-optimizer
```

## Running locally

### Backend (one time)
```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate    # Git Bash on Windows
# macOS/Linux: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0
```

### Mobile (one time)
```bash
cd mobile
npm install
npx expo start
```

## Running locally
The backend and the app run in **two separate terminals**.

**Terminal 1: backend** (from `backend/`, venv activated; you must re-activate it in every new terminal)
```bash
uvicorn app.main:app --reload --host 0.0.0.0
```
Interactive API docs appear at `http://localhost:8000/docs`.

**Terminal 2: app** (from `mobile/`)
```bash
npx expo start
```
Scan the QR code with Expo Go, or press `w` for the browser version.

## Project structure
```
backend/
  app/
    main.py                  FastAPI app
    api/routes/portfolio.py  /api/optimize endpoint
    schemas/portfolio.py     Pydantic request/response models
    services/
      market_data.py         price data (yfinance)
      qubo.py                builds the QUBO
      quantum_solver.py      QAOA via Qiskit
      classical_solver.py    classical baseline for comparison
  tests/
mobile/                      Expo app
docs/api-contract.md         agreed request/response shapes
```
