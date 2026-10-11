import { useState, type ReactNode } from 'react'
import type { OptimizeResponse } from '../types'
import { label, pct } from '../format'

interface BarDatum {
  name: string
  values: number[] // one per series, already in 0..1 of the chart's max
  display: string
  best?: boolean
}

function Bars({ rows, series, guess }: { rows: BarDatum[]; series: ('primary' | 'noisy')[]; guess?: number }) {
  return (
    <div className={`bars ${series.length > 1 ? 'paired' : ''}`}>
      {rows.map((row) => (
        <div className={`bar-row ${row.best ? 'best' : ''}`} key={row.name}>
          <span className="name" title={row.name}>
            {row.name}
            {row.best && <span className="tag">best</span>}
          </span>
          <span className="bar-track">
            {row.values.map((v, i) => (
              <span key={i} className={`bar-fill ${series[i]}`} style={{ width: `${Math.max(v, 0.005) * 100}%` }} />
            ))}
            {guess !== undefined && <span className="guess-line" style={{ left: `${guess * 100}%` }} aria-hidden />}
          </span>
          <span className="val">{row.display}</span>
        </div>
      ))}
    </div>
  )
}

/** Valid portfolios (exactly k stocks) by measured probability, plus one row for everything else. */
function outcomeRows(r: OptimizeResponse, withNoise: boolean) {
  const { ideal, noisy, shots } = r.qaoa
  const best = r.brute_force.bitstring
  const prob = (counts: Record<string, number>, b: string) => (counts[b] ?? 0) / shots
  const valid = r.brute_force.ranking.filter((b) => b.valid)
  const sorted = [...valid].sort((a, b) => prob(ideal.counts, b.bitstring) - prob(ideal.counts, a.bitstring)).slice(0, 6)
  const wrongIdeal = 1 - ideal.valid_fraction
  const wrongNoisy = noisy ? 1 - noisy.valid_fraction : 0
  const max = Math.max(
    wrongIdeal, wrongNoisy,
    ...sorted.map((b) => prob(ideal.counts, b.bitstring)),
    ...(noisy ? sorted.map((b) => prob(noisy.counts, b.bitstring)) : []),
  )
  const rows: BarDatum[] = sorted.map((b) => {
    const pi = prob(ideal.counts, b.bitstring)
    const pn = noisy ? prob(noisy.counts, b.bitstring) : 0
    return {
      name: label(b.bitstring, r.tickers),
      values: withNoise ? [pi / max, pn / max] : [pi / max],
      display: withNoise ? `${pct(pi)} → ${pct(pn)}` : pct(pi),
      best: b.bitstring === best,
    }
  })
  rows.push({
    name: `Not ${r.k} stocks`,
    values: withNoise ? [wrongIdeal / max, wrongNoisy / max] : [wrongIdeal / max],
    display: withNoise ? `${pct(wrongIdeal)} → ${pct(wrongNoisy)}` : pct(wrongIdeal),
  })
  return { rows, guess: r.qaoa.random_guess_prob / max }
}

function StepScore({ r }: { r: OptimizeResponse }) {
  const valid = r.brute_force.ranking.filter((b) => b.valid)
  const bestCost = valid[0].cost
  const worstCost = valid[valid.length - 1].cost
  const span = worstCost - bestCost || 1
  const total = 2 ** r.tickers.length
  const rows: BarDatum[] = valid.slice(0, 8).map((b, i) => ({
    name: label(b.bitstring, r.tickers),
    values: [0.08 + 0.92 * ((worstCost - b.cost) / span)],
    display: `#${i + 1}`,
    best: i === 0,
  }))

  return (
    <>
      <h3>Give every possible choice a score</h3>
      <p className="lead">
        First, the question becomes a scoring rule. A group of stocks scores well if it has <strong>grown in the past
        year</strong> and scores badly if its price <strong>swings a lot</strong>. Your risk setting decides which of
        the two matters more. Any group that doesn't hold exactly {r.k} stocks gets a big penalty.
      </p>
      <p className="lead">
        With {r.tickers.length} stocks there are only {total} possible choices, so an ordinary computer can score them
        all instantly. That gives us an answer key to check the quantum result against.
      </p>
      <div className="step-visual">
        <div className="bar-legend"><span>Groups of {r.k}, ranked by score (longer bar = better)</span></div>
        <Bars rows={rows} series={['primary']} />
      </div>
    </>
  )
}

function StepCircuit({ r }: { r: OptimizeResponse }) {
  return (
    <>
      <h3>Turn the stocks into qubits</h3>
      <p className="lead">
        Each stock gets one <strong>qubit</strong>. An ordinary bit is 0 or 1; a qubit can be in a mix of both at once,
        called <strong>superposition</strong>. That lets the circuit hold all {2 ** r.tickers.length} choices at the
        same time.
      </p>
      <p className="lead">
        The circuit then repeats a simple pattern ({r.reps} {r.reps === 1 ? 'time' : 'times'} here) that makes
        high-scoring choices more likely and low-scoring ones less likely. A regular computer tunes the pattern's
        settings until the results stop improving.
      </p>
      <div className="step-visual">
        {/* SVG rendered by Qiskit on our own backend */}
        <div className="circuit" role="img" aria-label="Quantum circuit diagram" dangerouslySetInnerHTML={{ __html: r.qaoa.circuit_svg }} />
        <div className="circuit-legend">
          <div><b><span className="swatch h" />Start</b>Puts every qubit in superposition, so all choices are equally likely.</div>
          <div><b><span className="swatch zz" />Score</b>Links pairs of stocks, using how they move together and the "hold {r.k}" rule.</div>
          <div><b><span className="swatch x" />Mix</b>Lets the choices interfere, so good ones add up and bad ones cancel out.</div>
        </div>
      </div>
    </>
  )
}

function StepMeasure({ r }: { r: OptimizeResponse }) {
  const q = r.qaoa.ideal
  const { rows, guess } = outcomeRows(r, false)
  return (
    <>
      <h3>Measure, many times</h3>
      <p className="lead">
        Looking at a qubit forces it to pick 0 or 1, so each run of the circuit gives one choice of stocks. We ran it
        {' '}{r.qaoa.shots.toLocaleString()} times and counted the results.
      </p>
      <p className="lead">
        The best choice came up in <strong>{pct(q.prob_optimal)}</strong> of runs, about{' '}
        <strong>{q.amplification.toFixed(1)}× more often</strong> than random guessing. The algorithm improved the
        odds, but didn't make the best answer certain. That's typical for small circuits.
      </p>
      {q.most_likely_bitstring !== r.brute_force.bitstring && (
        <p className="lead">
          The most common result was {label(q.most_likely_bitstring, r.tickers)}. We still report{' '}
          {label(q.bitstring, r.tickers)} because every result can be scored instantly, so we keep the best one we saw.
        </p>
      )}
      <div className="step-visual">
        <div className="bar-legend">
          <span><i style={{ background: 'var(--color-quantum)' }} />Best choice</span>
          <span><i style={{ background: 'var(--color-bar)' }} />Other choices</span>
          <span><i className="dash" />Random guess ({pct(r.qaoa.random_guess_prob)})</span>
        </div>
        <Bars rows={rows} series={['primary']} guess={guess} />
      </div>
    </>
  )
}

function StepNoise({ r }: { r: OptimizeResponse }) {
  const { ideal, noisy } = r.qaoa
  if (!noisy) return <p className="lead">The noisy run was skipped for this request.</p>
  const { rows, guess } = outcomeRows(r, true)
  return (
    <>
      <h3>Add real-world noise</h3>
      <p className="lead">
        Real quantum chips make small mistakes, and they can only connect neighbouring qubits, which adds extra steps.
        We ran the same circuit on a simulated IBM chip with realistic errors.
      </p>
      <p className="lead">
        The extra steps went from {ideal.two_qubit_gates} to {noisy.two_qubit_gates} two-qubit operations, and the best
        choice dropped from <strong>{pct(ideal.prob_optimal)}</strong> to <strong>{pct(noisy.prob_optimal)}</strong> of
        runs. Noise blurs the answer, which is one reason today's quantum computers are still limited.
      </p>
      <div className="step-visual">
        <div className="bar-legend">
          <span><i style={{ background: 'var(--color-quantum)' }} />Perfect simulator</span>
          <span><i style={{ background: 'var(--color-noisy)' }} />Noisy chip</span>
          <span><i className="dash" />Random guess</span>
        </div>
        <Bars rows={rows} series={['primary', 'noisy']} guess={guess} />
      </div>
    </>
  )
}

const STEPS: { title: string; render: (r: OptimizeResponse) => ReactNode }[] = [
  { title: 'Score every choice', render: (r) => <StepScore r={r} /> },
  { title: 'Turn stocks into qubits', render: (r) => <StepCircuit r={r} /> },
  { title: 'Measure many times', render: (r) => <StepMeasure r={r} /> },
  { title: 'Add real-world noise', render: (r) => <StepNoise r={r} /> },
]

export function Walkthrough({ r }: { r: OptimizeResponse }) {
  const [step, setStep] = useState(0)
  return (
    <section className="section" aria-labelledby="how-title">
      <div className="section-head">
        <h2 id="how-title">How it got there</h2>
        <p>Four steps, from a question about stocks to an answer from a (simulated) quantum computer.</p>
      </div>
      <div className="walk">
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button className="step-btn" aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
                <span className="step-num">{i + 1}</span>
                <span className="step-title">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="panel step-panel">
          {STEPS[step].render(r)}
          <div className="step-nav">
            <button className="btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
            {step < STEPS.length - 1 ? (
              <button className="btn-secondary" onClick={() => setStep(step + 1)}>Next step</button>
            ) : (
              <a className="btn-secondary" href="#compare">Compare with classical</a>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
