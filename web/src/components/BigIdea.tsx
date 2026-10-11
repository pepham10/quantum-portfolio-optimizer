// Illustrations use 3 stocks, so there are 8 possible portfolios: 000 … 111.
const LABELS = ['000', '001', '010', '011', '100', '101', '110', '111']
const EQUAL = [1, 1, 1, 1, 1, 1, 1, 1]
const TILTED = [0.3, 0.55, 0.2, 1.9, 0.4, 0.25, 0.85, 0.3]
const TOP = 3

function Bars({ heights, highlight, picked, caption }: { heights: number[]; highlight?: number; picked?: number; caption: string }) {
  const max = Math.max(...heights)
  return (
    <figure className="mini-figure">
      <div className="mini-bars" aria-hidden>
        {heights.map((h, i) => (
          <span
            key={i}
            className={`${i === highlight ? 'hl' : ''} ${picked !== undefined && i !== picked ? 'faded' : ''}`}
            style={{ height: `${(h / max) * 100}%` }}
          />
        ))}
      </div>
      <div className="mini-labels" aria-hidden>{LABELS.map((l) => <span key={l}>{l}</span>)}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

/** Two arrows and what they combine into. */
function Arrows({ same }: { same: boolean }) {
  const arrow = (x: number, y: number, len: number, angle: number, cls: string) => {
    const r = (angle * Math.PI) / 180
    const x2 = x + len * Math.cos(r)
    const y2 = y - len * Math.sin(r)
    return <line x1={x} y1={y} x2={x2} y2={y2} className={cls} markerEnd={`url(#head-${cls}-${same ? 's' : 'o'})`} />
  }
  return (
    <svg viewBox="0 0 300 96" className="arrows" role="img"
      aria-label={same ? 'Two arrows pointing the same way combine into a longer arrow' : 'Two arrows pointing opposite ways cancel out'}>
      <defs>
        {['a', 'sum'].map((c) => (
          <marker key={c} id={`head-${c}-${same ? 's' : 'o'}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className={`head-${c}`} />
          </marker>
        ))}
      </defs>
      {arrow(70, 30, 48, same ? 0 : 0, 'a')}
      {arrow(same ? 70 : 118, 66, 48, same ? 0 : 180, 'a')}
      <text x="134" y="54" className="op">=</text>
      {same ? arrow(156, 48, 96, 0, 'sum') : <circle cx="160" cy="48" r="4" className="zero" />}
      <text x={same ? 204 : 172} y={same ? 76 : 52} className="arrow-label" textAnchor={same ? 'middle' : 'start'}>
        {same ? 'longer = more likely' : 'gone = less likely'}
      </text>
    </svg>
  )
}

export function BigIdea() {
  return (
    <section className="section" aria-labelledby="idea-title">
      <div className="section-head">
        <h2 id="idea-title">How a quantum computer finds good answers</h2>
        <p>
          We'll use the stock question throughout. A <strong>portfolio</strong> is a group of stocks you hold. With 3
          stocks there are 8 possible portfolios, each written as 3 bits: <span className="ket-inline">011</span> means
          skip the first stock, hold the other two.
        </p>
      </div>

      <div className="ideas">
        <div className="idea">
          <Bars heights={EQUAL} caption="Chance of each portfolio coming out" />
          <h3>1. Superposition</h3>
          <p>
            Each stock gets a <strong>qubit</strong>. Unlike a normal bit, a qubit can be 0 and 1 at once. Together, the
            qubits hold all 8 portfolios at the same time, each equally likely.
          </p>
        </div>
        <div className="idea">
          <Bars heights={TILTED} highlight={TOP} caption="After interference" />
          <h3>2. Interference</h3>
          <p>
            The circuit then raises the chance of good portfolios and lowers the chance of bad ones. How it does that is
            explained just below.
          </p>
        </div>
        <div className="idea">
          <Bars heights={TILTED} highlight={TOP} picked={TOP} caption="One run gave 011" />
          <h3>3. Measurement</h3>
          <p>
            Reading the qubits gives <strong>one</strong> portfolio, chosen at random according to those chances. A
            portfolio with a 30% chance comes out in about 30 of every 100 runs, so we run the circuit many times and
            count.
          </p>
        </div>
      </div>

      <div className="panel interference">
        <div>
          <h3>How interference works</h3>
          <p>
            Behind each portfolio's chance is an <strong>arrow</strong>. A longer arrow means a bigger chance. (Physicists
            call it an amplitude.) At the start, all 8 arrows are the same length and point the same way.
          </p>
          <ol className="how-steps">
            <li>
              <strong>Score step: turn each arrow.</strong> Each portfolio's arrow is rotated by an amount that depends on
              its score. Turning doesn't change the length, so chances stay the same for now. But good and bad portfolios
              now point in different directions.
            </li>
            <li>
              <strong>Mix step: combine arrows.</strong> Each portfolio's arrow is blended with the arrows of portfolios
              that differ by one stock. Arrows pointing the same way add up; opposite ones cancel. Now the chances change.
            </li>
          </ol>
          <p>
            With the right amount of turning and mixing, the arrows of high-scoring portfolios end up adding together.
            That's interference.
          </p>
        </div>
        <div className="wave-pair">
          <figure>
            <Arrows same />
            <figcaption><strong>Pointing the same way:</strong> they add up.</figcaption>
          </figure>
          <figure>
            <Arrows same={false} />
            <figcaption><strong>Pointing opposite ways:</strong> they cancel.</figcaption>
          </figure>
        </div>
      </div>

      <div className="roles">
        <div>
          <h3>The quantum computer</h3>
          <p>Runs the circuit. Superposition, turning, mixing and measurement all happen physically, in the qubits.</p>
        </div>
        <div>
          <h3>A normal computer</h3>
          <p>
            Chooses <em>how much</em> to turn and mix, looks at the measured results, and adjusts those settings to
            improve them. Then the quantum computer runs again. This teamwork is why QAOA is called <strong>hybrid</strong>.
          </p>
        </div>
      </div>
    </section>
  )
}
