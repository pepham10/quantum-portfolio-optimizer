import { useEffect, useState, type ReactNode } from 'react'
import type { OptimizeResponse } from '../types'
import { label, pct } from '../format'

interface Row {
  key: string
  name: string
  value: number // 0..1 of the chart's max
  display: string
  top?: boolean
}

function Bars({ rows, guess, animate = false }: { rows: Row[]; guess?: number; animate?: boolean }) {
  return (
    <div className="bars">
      {rows.map((row) => (
        <div className={`bar-row ${row.top ? 'best' : ''}`} key={row.key}>
          <span className="name" title={row.name}>
            {row.name}
            {row.top && <span className="tag">top score</span>}
          </span>
          <span className="bar-track">
            {animate ? (
              <span className="bar-fill primary scale" style={{ transform: `scaleX(${row.value})` }} />
            ) : (
              <span className="bar-fill primary" style={{ width: `${Math.max(row.value, 0.005) * 100}%` }} />
            )}
            {guess !== undefined && <span className="guess-line" style={{ left: `${guess * 100}%` }} aria-hidden />}
          </span>
          <span className="val">{row.display}</span>
        </div>
      ))}
    </div>
  )
}

/** Valid portfolios (exactly k stocks) plus one row for all the rule-breakers, from a {bitstring: chance} map. */
function chanceRows(r: OptimizeResponse, chances: Record<string, number>, max: number, sortByChance: boolean): Row[] {
  const top = r.brute_force.bitstring
  let valid = r.brute_force.ranking.filter((b) => b.valid)
  if (sortByChance) valid = [...valid].sort((a, b) => (chances[b.bitstring] ?? 0) - (chances[a.bitstring] ?? 0))
  const wrong = Object.entries(chances).filter(([b]) => b.split('1').length - 1 !== r.k).reduce((a, [, p]) => a + p, 0)
  return [
    ...valid.slice(0, 6).map((b) => {
      const p = chances[b.bitstring] ?? 0
      return { key: b.bitstring, name: label(b.bitstring, r.tickers), value: p / max, display: pct(p), top: b.bitstring === top }
    }),
    { key: 'wrong', name: `Not ${r.k} stocks`, value: wrong / max, display: pct(wrong) },
  ]
}

function StepScore({ r }: { r: OptimizeResponse }) {
  const valid = r.brute_force.ranking.filter((b) => b.valid)
  const best = valid[0].cost
  const worst = valid[valid.length - 1].cost
  const span = worst - best || 1
  const rows: Row[] = valid.slice(0, 8).map((b, i) => ({
    key: b.bitstring,
    name: label(b.bitstring, r.tickers),
    value: 0.08 + 0.92 * ((worst - b.cost) / span),
    display: `#${i + 1}`,
    top: i === 0,
  }))
  return (
    <>
      <h3>Score every portfolio</h3>
      <p className="lead">
        A portfolio scores well if its stocks <strong>grew last year</strong> and badly if their prices{' '}
        <strong>swing a lot</strong>; your risk setting sets the balance. Portfolios without exactly {r.k} stocks get a
        penalty. The winner, the <strong>top-scoring portfolio</strong>, is what QAOA should find. A normal computer can
        check all {2 ** r.tickers.length} here, which gives us the answer key.
      </p>
      <div className="step-visual">
        <div className="bar-legend"><span>Portfolios of {r.k} stocks, ranked by score</span></div>
        <Bars rows={rows} />
      </div>
    </>
  )
}

function StepCircuit({ r }: { r: OptimizeResponse }) {
  return (
    <>
      <h3>Build the circuit</h3>
      <p className="lead">
        Your real circuit, drawn by Qiskit: <strong>start</strong>, then {r.reps} {r.reps === 1 ? 'layer' : 'layers'} of{' '}
        <strong>score</strong> (turn arrows) and <strong>mix</strong> (combine arrows), then measure. The numbers on the
        gates come from your stocks and risk setting.
      </p>
      <div className="step-visual">
        {/* SVG rendered by Qiskit on our own backend */}
        <div className="circuit" role="img" aria-label="Quantum circuit diagram" dangerouslySetInnerHTML={{ __html: r.qaoa.circuit_svg }} />
      </div>
    </>
  )
}

function StepChances({ r }: { r: OptimizeResponse }) {
  const stages = r.qaoa.evolution
  const [stage, setStage] = useState(stages.length - 1)
  const [playing, setPlaying] = useState(false)
  const isPlaying = playing && stage < stages.length - 1
  useEffect(() => {
    if (!isPlaying) return
    const id = setTimeout(() => setStage((s) => s + 1), 1100)
    return () => clearTimeout(id)
  }, [isPlaying, stage])

  const top = r.brute_force.bitstring
  const max = Math.max(...stages.flatMap((st) => chanceRows(r, st, 1, false).map((x) => x.value)))
  const rows = chanceRows(r, stages[stage], max, false)
  const names = ['Start', ...Array.from({ length: stages.length - 1 }, (_, i) => `After layer ${i + 1}`)]

  return (
    <>
      <h3>Watch the chances change</h3>
      <p className="lead">
        The real chances inside your circuit, layer by layer. They start equal; each layer of turning and mixing shifts
        them. The top-scoring portfolio goes from <strong>{pct(stages[0][top] ?? 0, 1)}</strong> to{' '}
        <strong>{pct(stages[stages.length - 1][top] ?? 0, 1)}</strong>.
      </p>
      <div className="step-visual">
        <div className="stage-controls">
          <button className="btn-secondary" onClick={() => { setStage(0); setPlaying(true) }} disabled={isPlaying}>
            {isPlaying ? 'Playing…' : 'Play'}
          </button>
          <div className="seg" role="group" aria-label="Circuit stage">
            {names.map((nm, i) => (
              <button key={nm} aria-pressed={stage === i} onClick={() => { setPlaying(false); setStage(i) }}>{nm}</button>
            ))}
          </div>
        </div>
        <Bars rows={rows} animate />
      </div>
    </>
  )
}

function StepMeasure({ r }: { r: OptimizeResponse }) {
  const q = r.qaoa.ideal
  const n = 2 ** r.tickers.length
  const shots = r.qaoa.shots
  const chances = Object.fromEntries(Object.entries(q.counts).map(([b, c]) => [b, c / shots]))
  const all = chanceRows(r, chances, 1, true)
  const max = Math.max(r.qaoa.random_guess_prob, ...all.map((x) => x.value))
  const rows = all.map((x) => ({ ...x, value: x.value / max }))
  return (
    <>
      <h3>Measure, many times</h3>
      <p className="lead">
        Each run gives one portfolio, e.g. <span className="ket-inline">{q.bitstring}</span> ={' '}
        {label(q.bitstring, r.tickers)}. Over {shots.toLocaleString()} runs the top-scoring portfolio came out{' '}
        <strong>{pct(q.prob_optimal)}</strong> of the time. Picking one of the {n} portfolios at random would get it{' '}
        {pct(r.qaoa.random_guess_prob)} of the time.
      </p>
      {q.most_likely_bitstring !== r.brute_force.bitstring && (
        <p className="lead">
          The most common result was {label(q.most_likely_bitstring, r.tickers)}; we report the highest-scoring portfolio
          seen, since each can be scored instantly.
        </p>
      )}
      <div className="step-visual">
        <div className="bar-legend">
          <span>How often each portfolio came out</span>
          <span><i className="dash" />Random pick ({pct(r.qaoa.random_guess_prob)})</span>
        </div>
        <Bars rows={rows} guess={r.qaoa.random_guess_prob / max} />
      </div>
    </>
  )
}

const STEPS: { title: string; render: (r: OptimizeResponse) => ReactNode }[] = [
  { title: 'Score every portfolio', render: (r) => <StepScore r={r} /> },
  { title: 'Build the circuit', render: (r) => <StepCircuit r={r} /> },
  { title: 'Watch the chances change', render: (r) => <StepChances r={r} /> },
  { title: 'Measure many times', render: (r) => <StepMeasure r={r} /> },
]

export function Walkthrough({ r }: { r: OptimizeResponse }) {
  const [step, setStep] = useState(0)
  return (
    <section className="section" aria-labelledby="how-title">
      <div className="section-head">
        <h2 id="how-title">What just happened</h2>
        <p>The same ideas, applied to your stocks, in four steps.</p>
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
            {step < STEPS.length - 1 && (
              <button className="btn-secondary" onClick={() => setStep(step + 1)}>Next step</button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
