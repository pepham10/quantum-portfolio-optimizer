import type { ReactNode } from 'react'

const REASONS = [
  { title: 'One recipe, many problems', text: 'Any decision made of yes/no choices with a score fits: one qubit per choice, then score, mix, measure.' },
  { title: 'Built for today’s machines', text: 'Short circuits, with a normal computer doing the tuning. That suits the small, noisy quantum computers that exist now.' },
  { title: 'Grows with the hardware', text: 'Every extra qubit doubles the number of options the circuit can hold at once.' },
]

const USES: { field: string; choice: string; qubit: string; scale: ReactNode }[] = [
  {
    field: 'Finance',
    choice: 'Pick 30 of 500 stocks within sector and budget limits.',
    qubit: 'Hold this stock?',
    scale: <>About 10<sup>48</sup> possible portfolios</>,
  },
  {
    field: 'Delivery',
    choice: 'Decide which truck visits which stop, and in what order.',
    qubit: 'Does this truck make this stop next?',
    scale: <>2.4 × 10<sup>18</sup> routes for one truck with 20 stops</>,
  },
  {
    field: 'Energy',
    choice: 'Choose which power plants run each hour to meet demand at the lowest cost.',
    qubit: 'Is this plant on this hour?',
    scale: '100 plants over a day: a 723-digit number',
  },
  {
    field: 'Scheduling',
    choice: 'Assign crews to flights, or jobs to factory machines.',
    qubit: 'Does this crew fly this flight?',
    scale: <>10<sup>100</sup> ways to put 100 jobs on 10 machines</>,
  },
  {
    field: 'Networks',
    choice: 'Split a network into two groups with as many links between them as possible (Max-Cut, QAOA’s classic test).',
    qubit: 'Which side is this node on?',
    scale: <>6 × 10<sup>29</sup> ways to split 100 nodes</>,
  },
]

const VISION = [
  {
    title: 'Medicine built around you',
    text: 'Choosing the best combination of treatments and doses for one patient, from millions of possible combinations, in minutes.',
  },
  {
    title: 'New materials, found faster',
    text: 'Deciding which atoms go where in a new battery, solar cell or catalyst, out of more arrangements than could ever be tested in a lab.',
  },
  {
    title: 'Cities that re-plan themselves',
    text: 'Every traffic light, bus and delivery route in a city re-optimized every few minutes as conditions change.',
  },
  {
    title: 'Grids that run on wind and sun',
    text: 'Deciding moment by moment which batteries charge, which plants run and where power flows, as the weather shifts.',
  },
  {
    title: 'Instant recovery from chaos',
    text: 'After a storm grounds hundreds of flights, an airline re-plans every plane and crew in minutes instead of days.',
  },
  {
    title: 'Designing molecules',
    text: 'Searching the huge space of possible protein and drug shapes for ones that fit a target, a problem researchers already test QAOA on in simplified forms.',
  },
]

const HURDLES = [
  { title: 'More reliable qubits', text: 'Real problems need thousands of qubits that rarely make mistakes. Today’s are still too error-prone.' },
  { title: 'Less noise', text: 'As the layers section showed, every extra operation adds errors. Hardware has to get much cleaner.' },
  { title: 'Proof that it wins', text: 'Classical methods are very good. Nobody has yet shown QAOA beating them on a real-world problem. At this demo’s size, a laptop wins easily.' },
]

export function Applications() {
  return (
    <section className="section" aria-labelledby="apps-title">
      <div className="section-head">
        <h2 id="apps-title">Why QAOA is exciting</h2>
        <p>
          The stock example is small on purpose. The same recipe applies to some of the hardest decisions in industry,
          where checking every option is impossible.
        </p>
      </div>

      <div className="reasons">
        {REASONS.map((x) => (
          <div key={x.title}>
            <h3>{x.title}</h3>
            <p>{x.text}</p>
          </div>
        ))}
      </div>

      <h3 className="sub-head">Picture a world where it works</h3>
      <p className="sub-lead">
        Suppose quantum computers become large and reliable, and QAOA or one of its descendants turns out to beat classical
        methods. These are the kinds of things that could open up. They are possibilities, not promises.
      </p>
      <div className="vision">
        {VISION.map((v) => (
          <div key={v.title}>
            <h4>{v.title}</h4>
            <p>{v.text}</p>
          </div>
        ))}
      </div>

      <h3 className="sub-head">The same recipe, written out</h3>
      <p className="sub-lead">Each of these is a set of yes/no choices plus a score, just like your stocks.</p>
      <ul className="uses">
        {USES.map((u) => (
          <li key={u.field}>
            <h4>{u.field}</h4>
            <div>
              <p>{u.choice}</p>
              <p className="qubit-means">Each qubit: “{u.qubit}”</p>
            </div>
            <p className="scale">{u.scale}</p>
          </li>
        ))}
      </ul>

      <div className="panel hurdles">
        <h3>What has to happen first</h3>
        <div className="hurdle-list">
          {HURDLES.map((h) => (
            <div key={h.title}>
              <h4>{h.title}</h4>
              <p>{h.text}</p>
            </div>
          ))}
        </div>
        <p className="hurdle-foot">
          If those hurdles fall, the payoff touches everyday life: better delivery routes, cheaper electricity, smoother
          schedules. That possibility is why QAOA is one of the most closely watched ideas in quantum computing.
        </p>
      </div>
    </section>
  )
}
