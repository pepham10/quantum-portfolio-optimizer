import { CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import type { OptimizeResponse } from '../types'
import { COLORS, duration, joinNames, pct } from '../format'

interface Point {
  volatility: number
  expected_return: number
  label: string
}

const bigDot = (props: unknown) => {
  const { cx, cy, fill } = props as { cx: number; cy: number; fill: string }
  return <circle cx={cx} cy={cy} r={7} fill={fill} stroke={COLORS.paper} strokeWidth={2} />
}

export function Comparison({ r }: { r: OptimizeResponse }) {
  const q = r.qaoa.ideal
  const weights = (w: Record<string, number>) =>
    Object.entries(w).filter(([, v]) => v > 0.005).map(([t, v]) => `${t} ${pct(v)}`).join(' · ')

  const stocks: Point[] = r.assets.map((a) => ({ volatility: a.volatility, expected_return: a.expected_return, label: a.ticker }))
  const quantum: Point[] = [{ volatility: r.quantum.volatility, expected_return: r.quantum.expected_return, label: 'Quantum pick' }]
  const classical: Point[] = [{ volatility: r.classical.volatility, expected_return: r.classical.expected_return, label: 'Classical mix' }]
  const all = [...stocks, ...quantum, ...classical, ...r.frontier.map((f) => ({ ...f, label: '' }))]
  const step = 0.1
  const xMax = Math.ceil((Math.max(...all.map((p) => p.volatility)) * 1.08) / step) * step
  const yMin = Math.floor(Math.min(0, ...all.map((p) => p.expected_return)) / step) * step
  const yMax = Math.ceil((Math.max(...all.map((p) => p.expected_return)) * 1.08) / step) * step
  const ticks = (lo: number, hi: number) =>
    Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => +(lo + i * step).toFixed(2))
  const axisTick = { fill: COLORS.axis, fontSize: 12 }

  return (
    <section className="section" id="compare" aria-labelledby="compare-title">
      <div className="section-head">
        <h2 id="compare-title">Quantum vs. classical</h2>
        <p>The same question, answered three ways. At this size, the classical methods are faster and just as good.</p>
      </div>

      <div className="compare">
        <div>
          <h3><span className="dot quantum" />Quantum algorithm</h3>
          <p className="what">Picks which stocks to hold, on a simulated quantum computer.</p>
          <p className="pick-line">{joinNames(q.tickers)}</p>
          <p className="time">{duration(r.qaoa.training_ms + q.runtime_ms)}</p>
        </div>
        <div>
          <h3><span className="dot check" />Check every option</h3>
          <p className="what">Scores all {2 ** r.tickers.length} choices with an ordinary computer. Always exact.</p>
          <p className="pick-line">{joinNames(r.brute_force.tickers)}</p>
          <p className="time">{duration(r.brute_force.runtime_ms)}</p>
        </div>
        <div>
          <h3><span className="dot classical" />Classical portfolio math</h3>
          <p className="what">The standard finance method. Can spread money across any of the stocks.</p>
          <p className="pick-line">{weights(r.classical.weights)}</p>
          <p className="time">{duration(r.classical.runtime_ms)}</p>
        </div>
      </div>

      <div className="chart-wrap">
        <div className="chart-box">
          <ResponsiveContainer>
            <ComposedChart margin={{ top: 12, right: 28, bottom: 24, left: 4 }}>
              <CartesianGrid stroke={COLORS.grid} />
              <XAxis
                type="number" dataKey="volatility" domain={[0, xMax]} ticks={ticks(0, xMax)} tickFormatter={(v) => pct(v)}
                tick={axisTick} axisLine={{ stroke: COLORS.rule }} tickLine={false}
                label={{ value: 'Risk: how much the price swings in a year', position: 'insideBottom', offset: -14, fill: COLORS.axis, fontSize: 12 }}
              />
              <YAxis
                type="number" dataKey="expected_return" domain={[yMin, yMax]} ticks={ticks(yMin, yMax)} tickFormatter={(v) => pct(v)}
                tick={axisTick} axisLine={false} tickLine={false} width={48}
              />
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as Point
                  return (
                    <div className="tooltip">
                      <b>{p.label || 'Best possible mix'}</b>
                      Past return {pct(p.expected_return)} · risk {pct(p.volatility)}
                    </div>
                  )
                }}
              />
              <Line data={r.frontier} dataKey="expected_return" stroke={COLORS.line} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Scatter data={stocks} fill={COLORS.stock} isAnimationActive={false}>
                <LabelList dataKey="label" position="right" fill={COLORS.axis} fontSize={12} />
              </Scatter>
              <Scatter data={classical} fill={COLORS.classical} shape={bigDot} isAnimationActive={false} />
              <Scatter data={quantum} fill={COLORS.quantum} shape={bigDot} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-caption">
          <p>
            <strong>Up</strong> means more growth last year; <strong>right</strong> means bigger price swings. Grey dots are
            single stocks.
          </p>
          <p>
            The line shows the best possible mixes: the most growth you could get for each level of risk. See where the
            quantum pick (<span style={{ color: 'var(--color-quantum)' }}>teal</span>) and the classical mix
            (<span style={{ color: 'var(--color-classical)' }}>amber</span>) land compared with it.
          </p>
          <p className="muted">Based on the past year's prices. Past growth doesn't predict future returns.</p>
        </div>
      </div>
    </section>
  )
}
