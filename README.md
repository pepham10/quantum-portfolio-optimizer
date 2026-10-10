# Quantum Portfolio Optimizer

Pick 3-5 stocks and a risk level; a QAOA-based optimizer (Qiskit) suggests a portfolio split.

## Stack
- **mobile/**: React Native + TypeScript + Expo
- **backend/**: Python + FastAPI, yfinance, pandas/numpy, Qiskit (QUBO + QAOA on AerSimulator)

## Running locally

### Backend
```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0
```

### Mobile
```bash
cd mobile
npm install
npx expo start
```

## Team workflow
- `main` is always working. Work on branches (`feat/...`), open a PR, merge.
- API shape lives in `docs/api-contract.md`.
