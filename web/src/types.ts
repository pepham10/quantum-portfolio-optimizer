// Mirrors backend/app/schemas/portfolio.py (see docs/api-contract.md).

export interface OptimizeRequest {
  tickers: string[]
  risk: number
  k?: number
  reps?: number
  include_noise?: boolean
}

export interface AssetStats {
  ticker: string
  expected_return: number
  volatility: number
}

export interface WeightedPortfolio {
  weights: Record<string, number>
  expected_return: number
  volatility: number
  runtime_ms: number
}

export interface RankedBitstring {
  bitstring: string
  tickers: string[]
  cost: number
  valid: boolean
  risk_term: number
  return_term: number
  penalty_term: number
}

export interface QaoaRun {
  counts: Record<string, number>
  bitstring: string
  tickers: string[]
  cost: number
  is_optimal: boolean
  approximation_ratio: number
  most_likely_bitstring: string
  prob_optimal: number
  amplification: number
  valid_fraction: number
  expected_cost: number
  circuit_depth: number
  two_qubit_gates: number
  backend: string
  runtime_ms: number
}

export interface OptimizeResponse {
  tickers: string[]
  risk: number
  k: number
  reps: number
  data: { source: 'live' | 'cache' | 'fallback'; start: string; end: string; trading_days: number }
  assets: AssetStats[]
  qubo: { matrix: number[][]; constant: number; penalty: number; mu_scaled: number[]; sigma_scaled: number[][] }
  qaoa: {
    ideal: QaoaRun
    noisy: QaoaRun | null
    shots: number
    random_guess_prob: number
    random_valid_fraction: number
    optimal_params: { beta: number[]; gamma: number[] }
    history: number[]
    circuit_svg: string
    training_ms: number
    hamiltonian: { pauli: string; coeff: number }[]
  }
  brute_force: { bitstring: string; tickers: string[]; cost: number; runtime_ms: number; ranking: RankedBitstring[] }
  quantum: WeightedPortfolio
  classical: WeightedPortfolio
  frontier: { volatility: number; expected_return: number }[]
  disclaimer: string
}
