import { useMemo, useState } from 'react'
import type { OptimizeResponse } from '../types'
import { label, pct } from '../format'

const CELL_W = 18
const CELL_H = 14

/** A small dial whose pointer turns with the setting (0..1 of its range). */
function Knob({ value }: { value: number }) {
  const angle = -135 + value * 270
  return (
    <svg viewBox="0 0 48 48" className="knob-svg" aria-hidden>
      <circle cx="24" cy="24" r="19" className="knob-face" />
      <path d="M10.6 37.4 A19 19 0 1 1 37.4 37.4" className="knob-track" />
      <line x1="24" y1="24" x2="24" y2="9" className="knob-pointer" transform={`rotate(${angle} 24 24)`} />
    </svg>
  )
}

export function Dials({ r }: { r: OptimizeResponse }) {
  const { betas, gammas, order, probs } = r.landscape
  const rows = betas.length // mix dial positions
  const cols = gammas.length // score dial positions
  const guess = r.qaoa.random_guess_prob
  const topName = label(order[0], r.tickers)

  const { pBest, maxP } = useMemo(() => {
    const pBest = probs.map((row) => row.map((cell) => cell[0]))
    return { pBest, maxP: Math.max(...pBest.flat()) }
  }, [probs])

  // The optimizer's own 1-layer setting, snapped to the grid. The mix dial repeats every π.
  const optimizer = useMemo(() => {
    const b = ((r.qaoa.layer1_params.beta % Math.PI) + Math.PI) % Math.PI
    const g = r.qaoa.layer1_params.gamma
    if (g < 0 || g >= 2 * Math.PI) return null
    const i = Math.min(rows - 1, Math.round(b / (Math.PI / rows)))
    const j = Math.min(cols - 1, Math.round(g / ((2 * Math.PI) / cols)))
    return { i, j, p: pBest[i][j] }
  }, [r, rows, cols, pBest])

  const [mix, setMix] = useState(0)
  const [score, setScore] = useState(0)
  const [bestSoFar, setBestSoFar] = useState(pBest[0][0])
  const [revealed, setRevealed] = useState(false)

  const cell = probs[mix][score]
  const top = cell[0]
  const maxBar = Math.max(...cell)
  const target = optimizer?.p ?? maxP

  const update = (i: number, j: number) => {
    setMix(i)
    setScore(j)
    setBestSoFar((b) => Math.max(b, pBest[i][j]))
  }

  const status =
    top >= target * 0.98 ? 'That matches or beats the optimizer.' :
    top > guess * 1.5 ? 'Better than random. Keep turning.' :
    top < guess * 0.8 ? 'Worse than random: here the arrows of the top portfolio cancel out.' :
    'About the same as picking at random.'

  return (
    <section className="section" aria-labelledby="dials-title">
      <div className="section-head">
        <h2 id="dials-title">Your turn: beat the optimizer</h2>
        <p>
          You take the normal computer's job. A one-layer circuit has two dials: how far the <strong>score</strong> step
          turns the arrows, and how strongly the <strong>mix</strong> step combines them. Turn them to make{' '}
          <strong>{topName}</strong> come out as often as possible.
        </p>
      </div>

      <div className="panel dials">
        <div className="dial-controls">
          <div className="dial">
            <Knob value={score / (cols - 1)} />
            <div className="dial-body">
              <label className="field-label" htmlFor="score-dial"><span>Score dial</span><span className="muted">turn</span></label>
              <input id="score-dial" type="range" min={0} max={cols - 1} value={score} onChange={(e) => update(mix, Number(e.target.value))} />
            </div>
          </div>
          <div className="dial">
            <Knob value={mix / (rows - 1)} />
            <div className="dial-body">
              <label className="field-label" htmlFor="mix-dial"><span>Mix dial</span><span className="muted">combine</span></label>
              <input id="mix-dial" type="range" min={0} max={rows - 1} value={mix} onChange={(e) => update(Number(e.target.value), score)} />
            </div>
          </div>

          <div className="scoreboard">
            <div>
              <div className="fact-label">Now</div>
              <div className="big-number small">{pct(top, 1)}</div>
            </div>
            <div>
              <div className="fact-label">Your best</div>
              <div className="big-number small">{pct(bestSoFar, 1)}</div>
            </div>
            <div>
              <div className="fact-label">Optimizer</div>
              <div className="big-number small">{pct(target, 1)}</div>
            </div>
          </div>
          <p className="muted dial-status" aria-live="polite">{status} Random pick: {pct(guess)}.</p>
        </div>

        <div className="dial-readout">
          <div className="fact-label">Chance of each portfolio at this setting</div>
          <div className="bars mini">
            {cell.slice(0, -1).map((p, idx) => (
              <div className={`bar-row ${idx === 0 ? 'best' : ''}`} key={order[idx]}>
                <span className="name">{label(order[idx], r.tickers)}</span>
                <span className="bar-track"><span className="bar-fill primary scale" style={{ transform: `scaleX(${p / maxBar})` }} /></span>
                <span className="val">{pct(p)}</span>
              </div>
            ))}
            <div className="bar-row">
              <span className="name">Not {r.k} stocks</span>
              <span className="bar-track"><span className="bar-fill scale" style={{ transform: `scaleX(${cell[cell.length - 1] / maxBar})` }} /></span>
              <span className="val">{pct(cell[cell.length - 1])}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="reveal">
        {!revealed ? (
          <button className="btn-secondary" onClick={() => setRevealed(true)}>Reveal the map of every setting</button>
        ) : (
          <div className="panel reveal-panel">
            <div className="dial-map">
              <svg
                className="heatmap"
                viewBox={`0 0 ${cols * CELL_W} ${rows * CELL_H}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`Map of ${rows * cols} dial settings; brighter means ${topName} comes out more often`}
                onClick={(e) => {
                  const box = e.currentTarget.getBoundingClientRect()
                  const j = Math.min(cols - 1, Math.floor(((e.clientX - box.left) / box.width) * cols))
                  const i = Math.min(rows - 1, rows - 1 - Math.floor(((e.clientY - box.top) / box.height) * rows))
                  update(Math.max(0, i), Math.max(0, j))
                }}
              >
                {pBest.map((row, i) =>
                  row.map((p, j) => (
                    <rect
                      key={`${i}-${j}`} x={j * CELL_W} y={(rows - 1 - i) * CELL_H} width={CELL_W} height={CELL_H}
                      fill={`color-mix(in oklch, var(--color-quantum) ${Math.round((p / maxP) ** 0.8 * 100)}%, var(--color-paper))`}
                    />
                  )),
                )}
                {optimizer && (
                  <circle cx={(optimizer.j + 0.5) * CELL_W} cy={(rows - optimizer.i - 0.5) * CELL_H} r={5}
                    fill="none" stroke="var(--color-classical)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                )}
                <rect x={score * CELL_W} y={(rows - 1 - mix) * CELL_H} width={CELL_W} height={CELL_H}
                  fill="none" stroke="var(--color-ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="axis-x"><span>Score dial →</span></div>
              <div className="axis-y"><span>Mix dial →</span></div>
            </div>
            <div className="explain-col">
              <h3>What you're looking at</h3>
              <p>
                Every square is one setting of the two dials ({rows * cols} in total). Brighter squares make {topName} come
                out more often. The white box is your setting; the <span className="ring-key" /> ring is the
                optimizer's. Click a square to jump there.
              </p>
              <p>
                The optimizer finds bright spots by trial and error, like you just did, only faster. With more layers
                there are more dials, and a map like this becomes impossible to draw.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
