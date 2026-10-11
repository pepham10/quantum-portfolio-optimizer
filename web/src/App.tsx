import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { OptimizeResponse } from './types'
import { defaultK, type Settings } from './settings'
import { Controls } from './components/Controls'
import { Result } from './components/Result'
import { Walkthrough } from './components/Walkthrough'
import { Comparison } from './components/Comparison'

const INITIAL: Settings = { tickers: ['NVDA', 'AAPL', 'MSFT', 'TSLA'], risk: 0.5, k: defaultK(4), reps: 2 }

const Logo = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="8.5" stroke="var(--color-ink)" strokeWidth="1.6" />
    <ellipse cx="12" cy="12" rx="8.5" ry="3.2" stroke="var(--color-ink-3)" strokeWidth="1.2" />
    <circle cx="16.5" cy="6.5" r="2" fill="var(--color-accent)" />
  </svg>
)

function Loading() {
  return (
    <div className="result" role="status">
      <div className="skeleton" style={{ height: 14, width: 180 }} />
      <div className="skeleton" style={{ height: 56, width: 'min(520px, 100%)', marginTop: 12 }} />
      <div className="skeleton" style={{ height: 96, marginTop: 32 }} />
      <p className="loading-line">Running the quantum simulation. This takes a few seconds.</p>
    </div>
  )
}

function HonestNote({ r }: { r: OptimizeResponse }) {
  const total = 2 ** r.tickers.length
  return (
    <section className="section">
      <div className="panel note">
        <h2>Is this a quantum advantage? No, and that's the point.</h2>
        <div>
          <p>
            With {r.tickers.length} stocks there are only {total} choices, and an ordinary laptop checks them all in a
            blink. The quantum version here is slower and less certain.
          </p>
          <p>
            What it shows is how the method works. Real funds choose from hundreds of assets, where the number of
            combinations explodes. Researchers hope quantum computers might help with problems like that one day, but
            nobody has shown it yet.
          </p>
        </div>
      </div>
    </section>
  )
}

export default function App() {
  const [popular, setPopular] = useState<string[]>([])
  const [settings, setSettings] = useState<Settings>(INITIAL)
  const [result, setResult] = useState<OptimizeResponse | null>(null)
  const [ranWith, setRanWith] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const run = useCallback(async (s: Settings) => {
    setRunning(true)
    setError(null)
    try {
      setResult(await api.optimize({ ...s, include_noise: true }))
      setRanWith(s)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setRunning(false)
    }
  }, [])

  // Load the ticker list and show a first result straight away, so the page is never empty.
  // (The ref stops React's development double-mount from sending two requests.)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    api.popular().then(setPopular).catch(() => setPopular([]))
    run(INITIAL)
  }, [run])

  const stale = result && ranWith && !running && JSON.stringify(ranWith) !== JSON.stringify(settings)

  return (
    <div className="page">
      <header className="topbar">
        <span className="wordmark"><Logo />QAOA Portfolio Lab</span>
        <span className="muted">An interactive explainer</span>
      </header>

      <section className="intro">
        <h1>See how a quantum algorithm picks stocks</h1>
        <div>
          <p>
            Choose a few stocks and how much risk you're comfortable with. A simulated quantum computer suggests which
            ones to hold, and we check its answer with ordinary math, step by step.
          </p>
          <p className="fineprint">Educational demo using past prices. Not financial advice.</p>
        </div>
      </section>

      <Controls popular={popular} settings={settings} onChange={setSettings} onRun={() => run(settings)} running={running} />
      {stale && <p className="stale">You changed the settings. Press Run to update the results.</p>}

      {error && (
        <div className="error-box" role="alert">
          <h2>That didn't work</h2>
          <p>{error}</p>
        </div>
      )}

      {running && !result ? (
        <Loading />
      ) : result ? (
        <div style={{ opacity: running ? 0.5 : 1, transition: 'opacity var(--dur-base) var(--ease-out)' }} aria-busy={running}>
          <Result r={result} />
          <Walkthrough r={result} />
          <Comparison r={result} />
          <HonestNote r={result} />
        </div>
      ) : null}

      <footer>
        <span>Not financial advice. Uses historical prices from Yahoo Finance; past performance does not predict future returns.</span>
        <span>Built with Qiskit, FastAPI and React</span>
      </footer>
    </div>
  )
}
