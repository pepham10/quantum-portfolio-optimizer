export const MIN_TICKERS = 3
export const MAX_TICKERS = 5

export interface Settings {
  tickers: string[]
  risk: number
  k: number
  reps: number
}

/** Default number of stocks to hold: about half of the picked tickers. */
export function defaultK(n: number) {
  return Math.max(1, Math.round(n / 2))
}
