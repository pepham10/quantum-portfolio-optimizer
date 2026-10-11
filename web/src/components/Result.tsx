import type { OptimizeResponse } from '../types'
import { duration, joinNames, pct } from '../format'
import { Ket } from './Ket'

const Info = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <circle cx="10" cy="10" r="8" /><path d="M10 9v5M10 6.2v.1" strokeLinecap="round" />
  </svg>
)

export function Result({ r }: { r: OptimizeResponse }) {
  const q = r.qaoa.ideal
  const total = 2 ** r.tickers.length

  return (
    <section className="result" aria-live="polite">
      <p className="result-kicker">QAOA's pick for your settings</p>
      <h2>
        Hold <span className="pick">{joinNames(q.tickers)}</span>
      </h2>
      <Ket bits={q.bitstring} tickers={r.tickers} />

      {!q.is_optimal && (
        <p className="verdict warn">
          <Info />
          Not the top-scoring portfolio this time: that is {joinNames(r.brute_force.tickers)}. Small circuits often get close
          without landing on it.
        </p>
      )}

      <div className="facts">
        <div className="fact">
          <div className="fact-label">What "top-scoring" means</div>
          <div className="fact-value small">Most past growth for the price swings you accept</div>
          <div className="fact-note">Holding exactly {r.k} of your {r.tickers.length} stocks</div>
        </div>
        <div className="fact">
          <div className="fact-label">How often the top-scoring portfolio came out</div>
          <div className="fact-value">{pct(q.prob_optimal)} of {r.qaoa.shots.toLocaleString()} runs</div>
          <div className="fact-note">Picking one of {total} portfolios at random: {pct(r.qaoa.random_guess_prob)}</div>
        </div>
        <div className="fact">
          <div className="fact-label">Time on the simulator</div>
          <div className="fact-value">{duration(r.qaoa.training_ms + q.runtime_ms)}</div>
          <div className="fact-note">Scoring every portfolio directly: {duration(r.brute_force.runtime_ms)}</div>
        </div>
      </div>
      <p className="aside-note">
        QAOA decides <em>which</em> stocks to hold, not how much money goes in each. That second question is easy for
        ordinary computers, so it is left out here.
      </p>
    </section>
  )
}
