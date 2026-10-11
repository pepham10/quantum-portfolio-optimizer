import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { OptimizeResponse } from '../types'
import { label, pct } from '../format'

const CELL_W = 18
const CELL_H = 14

interface Cell {
  i: number // mix dial position (row)
  j: number // score dial position (column)
}

/** A clickable map of every setting of a one-layer circuit's two dials. */
export function Dials({ r }: { r: OptimizeResponse }) {
  const { betas, gammas, order, probs } = r.landscape
  const rows = betas.length
  const cols = gammas.length
  const topName = label(order[0], r.tickers)
  const guess = r.qaoa.random_guess_prob

  const { pBest, maxP } = useMemo(() => {
    const pBest = probs.map((row) => row.map((cell) => cell[0]))
    return { pBest, maxP: Math.max(...pBest.flat()) }
  }, [probs])

  // The optimizer's own 1-layer setting, snapped to the grid. The mix dial repeats every π.
  const optimizer = useMemo((): Cell | null => {
    const b = ((r.qaoa.layer1_params.beta % Math.PI) + Math.PI) % Math.PI
    const g = r.qaoa.layer1_params.gamma
    if (g < 0 || g >= 2 * Math.PI) return null
    return {
      i: Math.min(rows - 1, Math.round(b / (Math.PI / rows))),
      j: Math.min(cols - 1, Math.round(g / ((2 * Math.PI) / cols))),
    }
  }, [r, rows, cols])

  const [sel, setSel] = useState<Cell>(optimizer ?? { i: 0, j: 0 })
  const cell = probs[sel.i][sel.j]
  const top = cell[0]
  const maxBar = Math.max(...cell)
  const isOptimizer = optimizer && optimizer.i === sel.i && optimizer.j === sel.j

  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const j = Math.floor(((e.clientX - box.left) / box.width) * cols)
    const i = rows - 1 - Math.floor(((e.clientY - box.top) / box.height) * rows)
    setSel({ i: Math.max(0, Math.min(rows - 1, i)), j: Math.max(0, Math.min(cols - 1, j)) })
  }

  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, [number, number]> = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    const m = moves[e.key]
    if (!m) return
    e.preventDefault()
    setSel((s) => ({ i: Math.max(0, Math.min(rows - 1, s.i + m[0])), j: Math.max(0, Math.min(cols - 1, s.j + m[1])) }))
  }

  const verdict =
    top >= maxP * 0.9 ? 'One of the brightest settings on the map.' :
    top > guess * 1.5 ? 'Better than a random pick.' :
    top < guess * 0.8 ? 'Worse than a random pick: here its arrows cancel out.' :
    'About the same as a random pick.'

  return (
    <section className="section" aria-labelledby="dials-title">
      <div className="section-head">
        <h2 id="dials-title">What the optimizer searches through</h2>
        <p>
          A one-layer circuit has two dials: how far the <strong>score</strong> step turns the arrows, and how strongly the{' '}
          <strong>mix</strong> step combines them. Each square on this map is one combination. Brighter squares make{' '}
          {topName} come out more often. Click any square to see the result of that setting.
        </p>
      </div>

      <div className="panel dials">
        <div className="dial-map">
          <svg
            className="heatmap"
            viewBox={`0 0 ${cols * CELL_W} ${rows * CELL_H}`}
            preserveAspectRatio="none"
            role="slider"
            tabIndex={0}
            aria-label="Circuit dial settings. Click a square or use the arrow keys."
            aria-valuetext={`Score dial ${sel.j + 1} of ${cols}, mix dial ${sel.i + 1} of ${rows}: ${topName} ${pct(top, 1)}`}
            onClick={onClick}
            onKeyDown={onKey}
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
            <rect x={sel.j * CELL_W} y={(rows - 1 - sel.i) * CELL_H} width={CELL_W} height={CELL_H}
              fill="none" stroke="var(--color-ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="axis-x"><span>Score dial →</span></div>
          <div className="axis-y"><span>Mix dial →</span></div>
          <div className="heat-legend">
            <span>Rarely</span><i aria-hidden /><span>Often</span>
            {optimizer && <span className="opt-key"><b aria-hidden />Optimizer's choice</span>}
          </div>
        </div>

        <div className="dial-readout" aria-live="polite">
          <div className="fact-label">
            {topName} at {isOptimizer ? "the optimizer's setting" : 'this setting'}
          </div>
          <div className="big-number small">{pct(top, 1)}</div>
          <p className="muted">{verdict} Random pick: {pct(guess)}.</p>

          <div className="fact-label" style={{ marginTop: 'var(--space-lg)' }}>Chance each portfolio comes out at this setting</div>
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
          {optimizer && !isOptimizer && (
            <div className="dial-actions">
              <button className="btn-secondary" onClick={() => setSel(optimizer)}>Back to the optimizer's choice</button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
