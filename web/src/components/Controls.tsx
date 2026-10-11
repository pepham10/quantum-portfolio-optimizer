import { useState } from 'react'
import { api, ApiError } from '../api'
import { defaultK, MAX_TICKERS, MIN_TICKERS, type Settings } from '../settings'

const FALLBACK_POPULAR = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'GOOGL', 'AMZN', 'META', 'JPM', 'XOM', 'KO', 'JNJ', 'WMT']

interface Props {
  popular: string[]
  settings: Settings
  onChange: (s: Settings) => void
  onRun: () => void
  running: boolean
}

function riskWord(r: number) {
  if (r < 0.2) return 'Very cautious'
  if (r < 0.45) return 'Cautious'
  if (r < 0.6) return 'Balanced'
  if (r < 0.85) return 'Growth'
  return 'Maximum growth'
}

export function Controls({ popular, settings, onChange, onRun, running }: Props) {
  const { tickers, risk, k, reps } = settings
  const [query, setQuery] = useState('')
  const [checking, setChecking] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const list = popular.length ? popular : FALLBACK_POPULAR
  const custom = tickers.filter((t) => !list.includes(t))
  const n = tickers.length
  const full = n >= MAX_TICKERS

  // k must stay between 1 and n-1, so reset it whenever the number of stocks changes.
  const setTickers = (next: string[]) => onChange({ ...settings, tickers: next, k: defaultK(next.length) })

  const toggle = (t: string) => {
    if (tickers.includes(t)) setTickers(tickers.filter((x) => x !== t))
    else if (!full) setTickers([...tickers, t])
  }

  const addCustom = async () => {
    const sym = query.trim().toUpperCase()
    setSearchError(null)
    if (!sym) return
    if (tickers.includes(sym)) return setSearchError(`${sym} is already selected.`)
    if (full) return setSearchError(`Pick at most ${MAX_TICKERS} stocks.`)
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(sym)) return setSearchError('Enter a ticker symbol, like AMD.')
    setChecking(true)
    try {
      const res = await api.validate(sym)
      if (!res.valid) setSearchError(`We couldn't find price data for ${sym}.`)
      else {
        setTickers([...tickers, res.ticker])
        setQuery('')
      }
    } catch (e) {
      setSearchError(e instanceof ApiError ? e.message : 'Could not check that ticker.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="panel setup">
      <div>
        <div className="field-label">
          <span>Stocks</span>
          <span className="count">{n} of 3–5</span>
        </div>
        <div className="chips" role="group" aria-label="Choose stocks">
          {list.map((t) => {
            const on = tickers.includes(t)
            return (
              <button key={t} className="chip" aria-pressed={on} disabled={!on && full} onClick={() => toggle(t)}>
                {t}
              </button>
            )
          })}
          {custom.map((t) => (
            <button key={t} className="chip" aria-pressed onClick={() => toggle(t)} aria-label={`Remove ${t}`}>
              {t} ×
            </button>
          ))}
        </div>
        <form className="add-ticker" onSubmit={(e) => { e.preventDefault(); addCustom() }}>
          <input
            className="input"
            placeholder="Add a ticker"
            value={query}
            maxLength={10}
            aria-label="Add another ticker"
            aria-invalid={searchError ? true : undefined}
            onChange={(e) => { setQuery(e.target.value); setSearchError(null) }}
          />
          <button className="btn-secondary" type="submit" disabled={checking || !query.trim() || full}>
            {checking ? 'Checking…' : 'Add'}
          </button>
        </form>
        {searchError ? (
          <p className="field-note" role="alert">{searchError}</p>
        ) : n < MIN_TICKERS ? (
          <p className="field-note">Pick {MIN_TICKERS - n} more.</p>
        ) : null}
      </div>

      <div>
        <label className="field-label" htmlFor="risk">
          <span>Risk</span>
          <span className="risk-value">{riskWord(risk)}</span>
        </label>
        <input
          id="risk" type="range" min={0} max={1} step={0.05} value={risk}
          onChange={(e) => onChange({ ...settings, risk: Number(e.target.value) })}
        />
        <div className="range-ends"><span>Safer</span><span>More growth</span></div>

        <details className="advanced">
          <summary>Advanced options</summary>
          <div className="advanced-body">
            <div>
              <div className="field-label"><span>Stocks to hold</span></div>
              <div className="seg" role="group" aria-label="Stocks to hold">
                {[1, 2, 3, 4].filter((v) => v < Math.max(n, 2)).map((v) => (
                  <button key={v} aria-pressed={k === v} onClick={() => onChange({ ...settings, k: v })}>{v}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="field-label"><span>Circuit layers</span></div>
              <div className="seg" role="group" aria-label="Circuit layers">
                {[1, 2, 3].map((v) => (
                  <button key={v} aria-pressed={reps === v} onClick={() => onChange({ ...settings, reps: v })}>{v}</button>
                ))}
              </div>
            </div>
          </div>
        </details>
      </div>

      <div className="run-col">
        <button
          className="btn-primary"
          onClick={onRun}
          disabled={running || n < MIN_TICKERS}
          data-state={running ? 'loading' : undefined}
        >
          {running ? 'Running…' : 'Run'}
        </button>
        <p className="field-note">Takes a few seconds</p>
      </div>
    </div>
  )
}
