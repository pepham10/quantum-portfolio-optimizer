export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`
export const duration = (ms: number) => (ms < 1 ? 'under 1 ms' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`)

/** Tickers held by a bitstring (bit i = ticker i, left to right). */
export const held = (bits: string, tickers: string[]) => tickers.filter((_, i) => bits[i] === '1')

/** "NVDA and AAPL", "NVDA, AAPL and KO" */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? 'nothing'
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export const label = (bits: string, tickers: string[]) => held(bits, tickers).join(' + ') || 'None'

// Chart colours come from tokens.css so the whole page shares one palette.
export const COLORS = {
  quantum: 'var(--color-quantum)',
  noisy: 'var(--color-noisy)',
  classical: 'var(--color-classical)',
  stock: 'var(--color-ink-3)',
  line: 'var(--color-ink-2)',
  grid: 'var(--color-grid)',
  axis: 'var(--color-ink-3)',
  rule: 'var(--color-rule-strong)',
  paper: 'var(--color-paper)',
}
