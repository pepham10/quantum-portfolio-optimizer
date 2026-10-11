import { useState } from 'react'
import type { Settings } from '../settings'

const UNIVERSE = [4, 10, 20, 50, 100, 250, 500]
const SP500 = { n: 500, k: 50 }
const CHECKS_PER_SECOND = 1e9 // a fast computer scoring a billion groups per second
const AGE_OF_UNIVERSE_YEARS = 1.38e10

/** Exact "n choose k" with BigInt (the numbers get far too big for normal floats). */
function choose(n: number, k: number): bigint {
  let r = 1n
  for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i)
  return r
}

const NAMES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion']

function describeCount(c: bigint) {
  const digits = c.toString().length
  if (digits <= 6) return Number(c).toLocaleString()
  const group = Math.floor((digits - 1) / 3)
  if (group < NAMES.length) {
    const lead = Number(c.toString().slice(0, 4)) / 10 ** (4 - (digits - group * 3))
    return `${lead.toFixed(lead < 10 ? 1 : 0)} ${NAMES[group]}`
  }
  return `a ${digits}-digit number`
}

function scientific(c: bigint) {
  const s = c.toString()
  return <>{s[0]}.{s.slice(1, 3)} × 10<sup>{s.length - 1}</sup></>
}

function describeTime(c: bigint) {
  const digits = c.toString().length
  const seconds = digits > 300 ? Infinity : Number(c) / CHECKS_PER_SECOND
  if (seconds < 0.001) return 'instantly'
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} seconds`
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`
  const years = seconds / 31_557_600
  if (years < 1) return `${Math.round(seconds / 86400)} days`
  if (years < 1e6) return `${Math.round(years).toLocaleString()} years`
  const universes = years / AGE_OF_UNIVERSE_YEARS
  if (universes < 1) return `${describeCount(BigInt(Math.round(years)))} years`
  return 'far longer than the age of the universe'
}

export function WhyHard({ settings }: { settings: Settings }) {
  const yourN = Math.max(2, settings.tickers.length) // the form briefly allows fewer than 3 while picking
  const yours = { n: yourN, k: Math.min(Math.max(1, settings.k), yourN - 1) }
  // "Your choice" follows the stocks picked in the form below; moving a slider switches to free exploring.
  const [onYours, setOnYours] = useState(true)
  const [custom, setCustom] = useState(SP500)
  const n = onYours ? yours.n : custom.n
  const k = onYours ? yours.k : custom.k
  const maxK = Math.min(n - 1, 50)
  const universe = UNIVERSE.includes(n) ? UNIVERSE : [...UNIVERSE, n].sort((a, b) => a - b)
  const count = choose(n, Math.min(k, maxK))
  const huge = count.toString().length > 21

  const pick = (nn: number, kk: number, mine = false) => {
    setOnYours(mine)
    if (!mine) setCustom({ n: nn, k: kk })
  }

  return (
    <section className="section" aria-labelledby="why-title">
      <div className="section-head">
        <h2 id="why-title">Small choices, enormous numbers</h2>
        <p>
          To be sure you have the best portfolio (group of stocks), you would have to score every possible one. That number
          grows fast.
        </p>
      </div>

      <div className="panel explode">
        <div className="explode-controls">
          <div className="chips" role="group" aria-label="Examples">
            <button className="chip" aria-pressed={onYours} onClick={() => pick(yours.n, yours.k, true)}>
              Your choice: {yours.k} of {yours.n}
            </button>
            <button className="chip" aria-pressed={!onYours && n === SP500.n && k === SP500.k} onClick={() => pick(SP500.n, SP500.k)}>
              50 of the S&amp;P 500
            </button>
          </div>
          <label className="field-label" htmlFor="universe">
            <span>Stocks to choose from</span>
            <span className="risk-value">{n}</span>
          </label>
          <input
            id="universe" type="range" min={0} max={universe.length - 1} step={1} value={Math.max(0, universe.indexOf(n))}
            onChange={(e) => {
              const nn = universe[Number(e.target.value)]
              pick(nn, Math.min(k, Math.min(nn - 1, 50)))
            }}
          />
          <label className="field-label" htmlFor="hold">
            <span>Stocks to hold</span>
            <span className="risk-value">{Math.min(k, maxK)}</span>
          </label>
          <input id="hold" type="range" min={1} max={maxK} step={1} value={Math.min(k, maxK)} onChange={(e) => pick(n, Number(e.target.value))} />
        </div>

        <div className="explode-readout" aria-live="polite">
          <div className="big-number">{describeCount(count)}</div>
          <p className="big-label">
            possible portfolios{huge && <span className="muted"> ({scientific(count)})</span>}
          </p>
          <p className="time-line">
            Checking them all at a billion per second: <strong>{describeTime(count)}</strong>
          </p>
        </div>
      </div>

      <p className="section-foot">
        Past a certain size, checking everything is hopeless, even for a supercomputer. Instead, people use strategies
        that find very good answers without checking every option. One of the most promising for quantum computers is
        called <strong>QAOA</strong>.
      </p>
    </section>
  )
}
