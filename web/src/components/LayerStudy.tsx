import type { OptimizeResponse } from '../types'
import { pct } from '../format'

export function LayerStudy({ r }: { r: OptimizeResponse }) {
  const study = r.qaoa.layer_study
  const top = r.brute_force.bitstring
  const rows = study.map((e) => ({
    layers: e.layers,
    ideal: e.ideal[top] ?? 0,
    noisy: e.noisy ? e.noisy[top] ?? 0 : null,
    ops: e.chip_two_qubit_gates ?? null,
  }))
  const max = Math.max(r.qaoa.random_guess_prob, ...rows.flatMap((x) => [x.ideal, x.noisy ?? 0]))
  const bestIdeal = rows.reduce((a, b) => (b.ideal > a.ideal ? b : a))
  const withNoise = rows.filter((x) => x.noisy !== null)
  const bestNoisy = withNoise.length ? withNoise.reduce((a, b) => ((b.noisy ?? 0) > (a.noisy ?? 0) ? b : a)) : null
  const guessY = (1 - r.qaoa.random_guess_prob / max) * 100

  return (
    <section className="section" aria-labelledby="layers-title">
      <div className="section-head">
        <h2 id="layers-title">More layers, more noise</h2>
        <p>
          Real quantum chips make small errors on every operation. We ran your circuit with 1, 2 and 3 layers on a
          perfect simulator and on a simulated IBM chip with realistic errors.
        </p>
      </div>

      <div className="panel layers">
        <div className="layer-chart" role="img" aria-label="Chance of the top-scoring portfolio for 1, 2 and 3 layers, perfect versus noisy">
          <div className="layer-plot">
            <span className="guess-h" style={{ top: `${guessY}%` }} aria-hidden />
            {rows.map((x) => (
              <div className="layer-group" key={x.layers}>
                <div className="layer-bars">
                  <span className="col ideal" style={{ height: `${(x.ideal / max) * 100}%` }}><b>{pct(x.ideal)}</b></span>
                  {x.noisy !== null && (
                    <span className="col noisy" style={{ height: `${(x.noisy / max) * 100}%` }}><b>{pct(x.noisy)}</b></span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="layer-axis">
            {rows.map((x) => (
              <div key={x.layers}>
                <strong>{x.layers} layer{x.layers > 1 ? 's' : ''}</strong>
                {x.ops !== null && <span>{x.ops} chip operations</span>}
              </div>
            ))}
          </div>
          <p className="chart-note">Bar height: how often the top-scoring portfolio comes out</p>
          <div className="bar-legend">
            <span><i style={{ background: 'var(--color-quantum)' }} />Perfect simulator</span>
            <span><i style={{ background: 'var(--color-noisy)' }} />Noisy chip</span>
            <span><i className="dash" />Random guessing ({pct(r.qaoa.random_guess_prob)})</span>
          </div>
        </div>

        <div className="explain-col">
          <h3>Adding layers</h3>
          <p>
            Each layer is another round of turning and mixing. On a perfect machine that usually helps: here the
            top-scoring portfolio peaks at{' '}
            <strong>{pct(bestIdeal.ideal)} with {bestIdeal.layers} layer{bestIdeal.layers > 1 ? 's' : ''}</strong>. With
            enough layers, QAOA can in theory find the exact answer.
          </p>
          <h3>The catch</h3>
          <p>
            Every layer adds operations, and each one can go slightly wrong. The chip can also only link neighbouring
            qubits, which adds even more.
            {bestNoisy && (
              <> On the noisy chip, the top-scoring portfolio does best with{' '}
              <strong>{bestNoisy.layers} layer{bestNoisy.layers > 1 ? 's' : ''}</strong>.</>
            )}
          </p>
          <h3>Removing layers</h3>
          <p>
            Fewer errors, but cruder steering. Finding the sweet spot is a major open problem in QAOA research.
          </p>
        </div>
      </div>
    </section>
  )
}
