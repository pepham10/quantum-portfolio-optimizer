"""Glue: data -> statistics -> QUBO -> (QAOA, brute force, Markowitz) -> one response."""

from __future__ import annotations

import time
from math import comb

import numpy as np

from app.schemas.portfolio import OptimizeRequest, OptimizeResponse
from app.services import classical_solver as cs
from app.services.market_data import annualized_stats, get_prices
from app.services.quantum_solver import build_hamiltonian, one_layer_landscape, run_qaoa
from app.services.qubo import build_qubo, from_bitstring


def _tickers_for(bits: str, tickers: list[str]) -> list[str]:
    return [t for t, b in zip(tickers, bits) if b == "1"]


def _weighted(weights: np.ndarray, tickers, mu, sigma, runtime_ms: float) -> dict:
    ret, vol = cs.portfolio_stats(weights, mu, sigma)
    return {
        "weights": {t: round(float(w), 4) for t, w in zip(tickers, weights)},
        "expected_return": ret, "volatility": vol, "runtime_ms": runtime_ms,
    }


def _backtest(prices, qaoa_w: np.ndarray, markowitz_w: np.ndarray) -> dict:
    """Hindsight check: growth of 1.0 invested on the first day of the price window.

    The picks were made using these same prices, so this is NOT a forecast.
    """
    n = prices.shape[1]
    dates, qaoa = cs.growth_curve(prices, qaoa_w)
    _, equal = cs.growth_curve(prices, np.full(n, 1 / n))
    _, markowitz = cs.growth_curve(prices, markowitz_w)
    return {"dates": dates, "qaoa": qaoa, "all_equal": equal, "markowitz": markowitz}


def optimize(req: OptimizeRequest) -> OptimizeResponse:
    tickers, n, k = req.tickers, len(req.tickers), req.k

    data = get_prices(tickers, req.lookback_days)
    mu, sigma = annualized_stats(data.prices)
    qubo = build_qubo(mu, sigma, req.risk, k)

    # Exact answer by checking all 2^n portfolios.
    bf = cs.brute_force(qubo)
    ranking = sorted(bf.all_costs.items(), key=lambda kv: kv[1])

    # QAOA: angles trained on the ideal simulator, then run on ideal + noisy devices.
    q = run_qaoa(qubo, reps=req.reps, shots=req.shots, with_noise=req.include_noise, labels=tickers)

    # Approximation ratio is measured over valid portfolios only:
    # 1 = optimal, 0 = the worst valid portfolio.
    worst_valid = max(c for b, c in bf.all_costs.items() if b.count("1") == k)

    def score(run) -> dict:
        span = worst_valid - bf.cost
        prob_opt = run.counts.get(bf.bitstring, 0) / q.shots
        return {
            "counts": run.counts,
            "bitstring": run.best_bitstring,
            "tickers": _tickers_for(run.best_bitstring, tickers),
            "cost": run.best_cost,
            "is_optimal": run.best_bitstring == bf.bitstring,
            "approximation_ratio": 1.0 if span == 0 else (worst_valid - run.best_cost) / span,
            "most_likely_bitstring": run.most_likely_bitstring,
            "prob_optimal": prob_opt,
            "amplification": prob_opt * 2**n,
            "valid_fraction": sum(v for b, v in run.counts.items() if b.count("1") == k) / q.shots,
            "expected_cost": run.expected_cost,
            "circuit_depth": run.circuit_depth,
            "two_qubit_gates": run.two_qubit_gates,
            "backend": run.backend_name,
            "runtime_ms": run.runtime_ms,
        }

    # "Tune the dials" grid: 1-layer probabilities for valid portfolios (best first)
    # plus one bucket for everything that breaks the "hold k" rule.
    betas = np.linspace(0, np.pi, 20, endpoint=False)
    gammas = np.linspace(0, 2 * np.pi, 28, endpoint=False)
    grid = one_layer_landscape(build_hamiltonian(qubo)[0], betas, gammas)
    valid_order = [b for b, _ in ranking if b.count("1") == k]
    index = [int(b[::-1], 2) for b in valid_order]  # stock-order bitstring -> Qiskit index
    valid_probs = grid[..., index]
    other = 1 - valid_probs.sum(axis=-1, keepdims=True)
    landscape = {
        "betas": betas.round(4).tolist(),
        "gammas": gammas.round(4).tolist(),
        "order": valid_order,
        "probs": np.concatenate([valid_probs, other], axis=-1).round(4).tolist(),
    }

    # QAOA answers "which stocks?", not "how much of each?". For the risk/return
    # chart we simply split the money evenly across the chosen stocks.
    selected = from_bitstring(q.ideal.best_bitstring).astype(bool)
    full_w = selected / selected.sum()

    t0 = time.perf_counter()
    mk_w = cs.markowitz_weights(mu, sigma, req.risk)
    mk_ms = (time.perf_counter() - t0) * 1000

    return OptimizeResponse(
        tickers=tickers, risk=req.risk, k=k, reps=req.reps,
        data={
            "source": data.source,
            "start": data.prices.index.min().date().isoformat(),
            "end": data.prices.index.max().date().isoformat(),
            "trading_days": len(data.prices),
        },
        assets=[
            {"ticker": t, "expected_return": float(mu[i]), "volatility": float(np.sqrt(sigma[i, i]))}
            for i, t in enumerate(tickers)
        ],
        qubo={
            "matrix": qubo.Q.tolist(), "constant": qubo.constant, "penalty": qubo.penalty,
            "mu_scaled": qubo.mu_scaled.tolist(), "sigma_scaled": qubo.sigma_scaled.tolist(),
        },
        qaoa={
            "ideal": score(q.ideal),
            "noisy": score(q.noisy) if q.noisy else None,
            "shots": q.shots,
            "random_guess_prob": 1 / 2**n,
            "random_valid_fraction": comb(n, k) / 2**n,
            "optimal_params": q.optimal_params,
            "history": q.history,
            "circuit_svg": q.circuit_svg,
            "training_ms": q.training_ms,
            "hamiltonian": q.hamiltonian,
            "evolution": [{b: round(p, 5) for b, p in stage.items()} for stage in q.evolution],
            "layer1_params": q.layer1_params,
            "layer_study": [
                {**e, "ideal": {b: round(p, 5) for b, p in e["ideal"].items()},
                 **({"noisy": {b: round(p, 5) for b, p in e["noisy"].items()}} if "noisy" in e else {})}
                for e in q.layer_study
            ],
        },
        brute_force={
            "bitstring": bf.bitstring, "tickers": _tickers_for(bf.bitstring, tickers),
            "cost": bf.cost, "runtime_ms": bf.runtime_ms,
            "ranking": [
                {"bitstring": b, "tickers": _tickers_for(b, tickers), "cost": c,
                 "valid": b.count("1") == k, **qubo.objective_parts(from_bitstring(b))}
                for b, c in ranking
            ],
        },
        quantum=_weighted(full_w, tickers, mu, sigma, q.training_ms + q.ideal.runtime_ms),
        classical=_weighted(mk_w, tickers, mu, sigma, mk_ms),
        frontier=cs.efficient_frontier(mu, sigma),
        landscape=landscape,
        backtest=_backtest(data.prices, full_w, mk_w),
    )
