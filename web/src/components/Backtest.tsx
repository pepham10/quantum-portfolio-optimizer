import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { OptimizeResponse } from '../types'
import { COLORS, joinNames } from '../format'

const money = (x: number) => x.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const short = (x: number) => (Math.abs(x) >= 1000 ? `$${Math.round(x / 1000)}k` : money(x))
const month = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })

export function Backtest({ r }: { r: OptimizeResponse }) {
  const [amount, setAmount] = useState(100_000)
  const bt = r.backtest
  const rows = bt.dates.map((d, i) => ({
    date: d,
    qaoa: bt.qaoa[i] * amount,
    all: bt.all_equal[i] * amount,
    markowitz: bt.markowitz[i] * amount,
  }))
  const last = rows[rows.length - 1]
  const lines = [
    { key: 'qaoa' as const, name: `QAOA's pick (${joinNames(r.qaoa.ideal.tickers)}, split evenly)`, color: COLORS.quantum, width: 3 },
    { key: 'markowitz' as const, name: 'Classical mix (Markowitz)', color: COLORS.classical, width: 2 },
    { key: 'all' as const, name: `All ${r.tickers.length} of your stocks, split evenly`, color: COLORS.stock, width: 2 },
  ]

  return (
    <section className="section" aria-labelledby="money-title">
      <div className="section-head">
        <h2 id="money-title">What if you had invested a year ago?</h2>
        <p>
          Hindsight only: the algorithm chose using these same past prices, so this shows how the pick fits the past, not
          what it will do next.
        </p>
      </div>

      <div className="panel money">
        <div className="money-top">
          <label className="field-label" htmlFor="amount"><span>Amount invested on {month(bt.dates[0])}</span></label>
          <div className="amount-input">
            <span aria-hidden>$</span>
            <input
              id="amount" className="input" inputMode="numeric" value={amount.toLocaleString('en-US')}
              onChange={(e) => {
                const v = Number(e.target.value.replace(/[^0-9]/g, ''))
                setAmount(Math.min(v, 1_000_000_000))
              }}
            />
          </div>
          <div className="money-results">
            {lines.map((l) => {
              const end = last[l.key]
              const gain = end - amount
              return (
                <div key={l.key}>
                  <div className="fact-label"><span className="dot" style={{ background: l.color }} />{l.name}</div>
                  <div className="fact-value">{money(end)}</div>
                  <div className={`fact-note ${gain >= 0 ? 'up' : 'down'}`}>
                    {gain >= 0 ? '+' : '−'}{money(Math.abs(gain))} ({amount ? ((gain / amount) * 100).toFixed(1) : '0'}%)
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="chart-box">
          <ResponsiveContainer>
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={month} tick={{ fill: COLORS.axis, fontSize: 12 }} axisLine={{ stroke: COLORS.rule }} tickLine={false} minTickGap={40} />
              <YAxis tickFormatter={short} tick={{ fill: COLORS.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={56} domain={['auto', 'auto']} />
              <Tooltip
                cursor={{ stroke: COLORS.rule }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload as (typeof rows)[number]
                  return (
                    <div className="tooltip">
                      <b>{new Date(String(label) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</b>
                      {lines.map((l) => <div key={l.key}><span className="dot" style={{ background: l.color }} /> {money(row[l.key])}</div>)}
                    </div>
                  )
                }}
              />
              {lines.map((l) => (
                <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={l.width} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="aside-note">
          Bought once at the start and held, ignoring fees, taxes and dividends. Past performance does not predict future
          returns. Not financial advice.
        </p>
      </div>
    </section>
  )
}
