import type { OptimizeResponse } from '../types'
import { duration, joinNames, pct } from '../format'

const Check = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 10.5l4 4 8-9" /></svg>
)
const Info = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <circle cx="10" cy="10" r="8" /><path d="M10 9v5M10 6.2v.1" strokeLinecap="round" />
  </svg>
)

export function Result({ r }: { r: OptimizeResponse }) {
  const q = r.qaoa.ideal
  const total = 2 ** r.tickers.length
  const split = q.tickers.map((t) => `${t} ${pct(r.quantum.weights[t] ?? 0)}`).join(' · ')

  return (
    <section className="result" aria-live="polite">
      <p className="result-kicker">The quantum algorithm suggests</p>
      <h2>
        Hold <span className="pick">{joinNames(q.tickers)}</span>
      </h2>

      {q.is_optimal ? (
        <p className="verdict good">
          <Check />
          That's the best possible choice. We confirmed it by checking all {total} combinations the ordinary way.
        </p>
      ) : (
        <p className="verdict warn">
          <Info />
          Close, but not the best. Checking all {total} combinations finds {joinNames(r.brute_force.tickers)}.
          Small quantum circuits often get near the answer without landing on it.
        </p>
      )}

      <div className="facts">
        <div className="fact">
          <div className="fact-label">How often it gave the best answer</div>
          <div className="fact-value">{pct(q.prob_optimal)} of runs</div>
          <div className="fact-note">Random guessing: {pct(r.qaoa.random_guess_prob)}</div>
        </div>
        <div className="fact">
          <div className="fact-label">Suggested split</div>
          <div className="fact-value">{split}</div>
          <div className="fact-note">An ordinary calculation decides the amounts</div>
        </div>
        <div className="fact">
          <div className="fact-label">Time on the simulator</div>
          <div className="fact-value">{duration(r.qaoa.training_ms + q.runtime_ms)}</div>
          <div className="fact-note">Checking every option: {duration(r.brute_force.runtime_ms)}</div>
        </div>
      </div>
    </section>
  )
}
