from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator

DISCLAIMER = (
    "Educational demo only. Uses past prices, and past performance does not predict "
    "future returns. Not financial advice."
)


class OptimizeRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=3, max_length=5, examples=[["NVDA", "AAPL", "MSFT", "TSLA"]])
    risk: float = Field(0.5, ge=0, le=1, description="0 = capital preservation, 1 = maximum growth")
    k: int | None = Field(None, ge=1, le=4, description="Stocks to hold. Default: half the tickers, rounded")
    reps: int = Field(2, ge=1, le=3, description="QAOA layers")
    include_noise: bool = Field(True, description="Also run the trained circuit on a simulated noisy IBM device")
    lookback_days: int = Field(365, ge=180, le=730)
    shots: int = Field(2048, ge=256, le=8192)

    @field_validator("tickers")
    @classmethod
    def clean_tickers(cls, v: list[str]) -> list[str]:
        cleaned = [t.strip().upper() for t in v]
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("tickers must be unique")
        return cleaned

    @model_validator(mode="after")
    def default_k(self):
        n = len(self.tickers)
        if self.k is None:
            self.k = max(1, round(n / 2))
        if not 1 <= self.k < n:
            raise ValueError(f"k must be between 1 and {n - 1} for {n} tickers")
        return self


class AssetStats(BaseModel):
    ticker: str
    expected_return: float  # annualized, 0.18 = 18%
    volatility: float       # annualized standard deviation


class DataInfo(BaseModel):
    source: str  # live | cache | fallback
    start: str
    end: str
    trading_days: int


class WeightedPortfolio(BaseModel):
    weights: dict[str, float]
    expected_return: float
    volatility: float
    runtime_ms: float


class QuboInfo(BaseModel):
    matrix: list[list[float]]
    constant: float
    penalty: float
    mu_scaled: list[float]
    sigma_scaled: list[list[float]]


class RankedBitstring(BaseModel):
    bitstring: str
    tickers: list[str]
    cost: float
    valid: bool  # holds exactly k stocks
    risk_term: float
    return_term: float
    penalty_term: float


class BruteForceResult(BaseModel):
    bitstring: str
    tickers: list[str]
    cost: float
    runtime_ms: float
    ranking: list[RankedBitstring]  # all 2^n bitstrings, best first


class QaoaRun(BaseModel):
    """Final measurements on one simulated device (ideal or noisy)."""

    counts: dict[str, int]
    bitstring: str                 # lowest-cost measured bitstring
    tickers: list[str]
    cost: float
    is_optimal: bool
    approximation_ratio: float     # 1 = optimal, 0 = worst valid portfolio
    most_likely_bitstring: str
    prob_optimal: float            # share of shots that measured the true optimum
    amplification: float           # prob_optimal / random-guess probability
    valid_fraction: float          # share of shots holding exactly k stocks
    expected_cost: float
    circuit_depth: int
    two_qubit_gates: int
    backend: str
    runtime_ms: float


class QaoaResult(BaseModel):
    ideal: QaoaRun
    noisy: QaoaRun | None          # same circuit + angles, on a noisy device model
    shots: int
    random_guess_prob: float       # 1 / 2^n
    random_valid_fraction: float   # C(n, k) / 2^n
    optimal_params: dict[str, list[float]]
    history: list[float]           # average cost at each optimizer step
    circuit_svg: str
    training_ms: float
    hamiltonian: list[dict]
    evolution: list[dict[str, float]]  # exact probabilities at start and after each layer
    layer1_params: dict[str, float]    # optimizer's 1-layer setting (beta, gamma)
    layer_study: list[dict]            # per layer count: ideal/noisy odds and chip operation count


class Landscape(BaseModel):
    """1-layer QAOA results over a grid of the two circuit settings (for the "tune the dials" view).

    probs[i][j] lists the probability of each portfolio in `order` (valid portfolios,
    best first) for betas[i] and gammas[j]; its last entry is the total for all
    portfolios that break the "hold k" rule.
    """

    betas: list[float]
    gammas: list[float]
    order: list[str]
    probs: list[list[list[float]]]


class FrontierPoint(BaseModel):
    volatility: float
    expected_return: float


class Backtest(BaseModel):
    """Growth of 1.0 invested at the start of the price window (hindsight, not a forecast)."""

    dates: list[str]
    qaoa: list[float]       # QAOA's picks, money split evenly
    all_equal: list[float]  # every selected ticker, money split evenly
    markowitz: list[float]  # classical mean-variance mix


class OptimizeResponse(BaseModel):
    tickers: list[str]
    risk: float
    k: int
    reps: int
    data: DataInfo
    assets: list[AssetStats]
    qubo: QuboInfo
    qaoa: QaoaResult
    brute_force: BruteForceResult
    quantum: WeightedPortfolio    # QAOA's chosen stocks with the money split evenly (QAOA only picks *which*)
    classical: WeightedPortfolio  # Markowitz over all tickers (no "exactly k" rule)
    frontier: list[FrontierPoint]
    landscape: Landscape
    backtest: Backtest
    disclaimer: str = DISCLAIMER


class TickerCheck(BaseModel):
    ticker: str
    valid: bool
