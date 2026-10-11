import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { OptimizeResponse } from './types'
import { defaultK, type Settings } from './settings'
import { Controls } from './components/Controls'
import { Result } from './components/Result'
import { Walkthrough } from './components/Walkthrough'
import { Comparison } from './components/Comparison'
import { WhyHard } from './components/WhyHard'
import { BigIdea } from './components/BigIdea'
import { Dials } from './components/Dials'
import { QaoaIntro } from './components/QaoaIntro'
import { CircuitAnatomy } from './components/CircuitAnatomy'
import { LayerStudy } from './components/LayerStudy'
import { Applications } from './components/Applications'
import { Backtest } from './components/Backtest'

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
        <span className="wordmark"><Logo />Quantum Portfolio Lab</span>
        <span className="muted">An interactive explainer</span>
      </header>

      <section className="intro">
        <h1>How a quantum computer hunts for the best choice</h1>
        <p>
            Some decisions have more options than any computer could ever check. See how one quantum algorithm takes them
            on, then run it yourself on real stocks.
        </p>
        <p className="fineprint">Educational demo using past prices. Not financial advice.</p>
      </section>

      <WhyHard settings={settings} />
      <QaoaIntro />
      <BigIdea />
      <CircuitAnatomy />

      <section className="section" aria-labelledby="try-title">
        <div className="section-head">
          <h2 id="try-title">Try it on real stocks</h2>
          <p>
            Each stock becomes one qubit. Pick your stocks and risk level, and QAOA chooses which ones to hold using a
            simulated quantum computer and a year of real prices.
          </p>
        </div>
        <Controls popular={popular} settings={settings} onChange={setSettings} onRun={() => run(settings)} running={running} />
        {stale && <p className="stale">You changed the settings. Press Run to update the results.</p>}
      </section>

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
          <Backtest r={result} />
          <Walkthrough r={result} />
          <LayerStudy r={result} />
          <Dials key={JSON.stringify(ranWith)} r={result} />
          <Comparison r={result} />
        </div>
      ) : null}

      <Applications />

      <footer>
        <span>Not financial advice. Uses historical prices from Yahoo Finance; past performance does not predict future returns.</span>
        <span>Built with Qiskit, FastAPI and React</span>
      </footer>
    </div>
  )
}
