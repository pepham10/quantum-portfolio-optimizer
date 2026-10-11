// A hand-drawn, labelled 3-qubit QAOA circuit: the vocabulary before the real thing.
const WIRES = [104, 154, 204]

const STEPS = [
  { x: 96, title: 'Start', sub: 'all portfolios equal' },
  { x: 262, title: 'Score', sub: 'turn each arrow by its score' },
  { x: 420, title: 'Mix', sub: 'combine arrows' },
  { x: 548, title: 'Measure', sub: 'read 0 or 1' },
]

function Diagram() {
  return (
    <svg className="anatomy" viewBox="0 0 780 280" role="img" aria-label="Annotated example of a QAOA circuit with three qubits: start, score, mix, measure">
      <rect x="158" y="70" width="312" height="166" rx="10" className="layer-box" />
      <text x="314" y="260" textAnchor="middle" className="note">one layer = score + mix (repeat it to add layers)</text>

      {STEPS.map((s) => (
        <g key={s.title}>
          <text x={s.x} y="26" textAnchor="middle" className="step">{s.title}</text>
          <text x={s.x} y="46" textAnchor="middle" className="note">{s.sub}</text>
        </g>
      ))}

      {WIRES.map((y, i) => (
        <g key={y}>
          <text x="10" y={y + 5} className="wire-label">Stock {i + 1}</text>
          <line x1="70" y1={y} x2="580" y2={y} className="wire" />
        </g>
      ))}

      {WIRES.map((y) => (
        <g key={`h${y}`}>
          <rect x="80" y={y - 14} width="32" height="28" rx="5" className="g-h" />
          <text x="96" y={y + 5} textAnchor="middle" className="g-text">H</text>
        </g>
      ))}

      {[[0, 1, 210], [1, 2, 262], [0, 2, 314]].map(([a, b, x]) => (
        <g key={x}>
          <line x1={x} y1={WIRES[a]} x2={x} y2={WIRES[b]} className="g-link" />
          <circle cx={x} cy={WIRES[a]} r="6" className="g-dot" />
          <circle cx={x} cy={WIRES[b]} r="6" className="g-dot" />
        </g>
      ))}

      {WIRES.map((y) => (
        <g key={`x${y}`}>
          <rect x="404" y={y - 14} width="32" height="28" rx="5" className="g-x" />
          <text x="420" y={y + 5} textAnchor="middle" className="g-text">X</text>
        </g>
      ))}

      {WIRES.map((y) => (
        <g key={`m${y}`}>
          <rect x="532" y={y - 14} width="32" height="28" rx="5" className="g-m" />
          <path d={`M${539},${y + 6} A9,9 0 0 1 ${557},${y + 6}`} className="meter" />
          <line x1="548" y1={y + 6} x2="555" y2={y - 7} className="meter" />
        </g>
      ))}

      {['1', '0', '1'].map((bit, i) => (
        <text key={i} x="610" y={WIRES[i] + 6} className={`bit ${bit === '1' ? 'on' : ''}`}>{bit}</text>
      ))}
      <text x="640" y="150" className="note">buy stocks 1 and 3,</text>
      <text x="640" y="168" className="note">skip stock 2</text>
    </svg>
  )
}

const PARTS = [
  { term: 'Start', swatch: 'h', text: 'An H gate on each qubit puts it in superposition: every portfolio gets the same arrow.' },
  { term: 'Score', swatch: 'zz', text: 'Turns each portfolio’s arrow by its score. The links between pairs of stocks carry how they move together and the “hold k” rule.' },
  { term: 'Mix', swatch: 'x', text: 'Combines each portfolio’s arrow with those of portfolios one stock away, so arrows add up or cancel. This is where chances change.' },
  { term: 'Measure', swatch: 'm', text: 'Each qubit is read as 0 or 1. Together they spell out one portfolio.' },
]

export function CircuitAnatomy() {
  return (
    <section className="section" aria-labelledby="circuit-title">
      <div className="section-head">
        <h2 id="circuit-title">What is a quantum circuit?</h2>
        <p>
          A quantum program is drawn as a circuit. Each line is one qubit (one stock), each box or link is an operation,
          and time runs left to right. Here is a QAOA circuit for three stocks.
        </p>
      </div>
      <div className="panel anatomy-wrap">
        <Diagram />
      </div>
      <dl className="parts">
        {PARTS.map((p) => (
          <div key={p.term}>
            <dt><span className={`swatch ${p.swatch}`} />{p.term}</dt>
            <dd>{p.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
