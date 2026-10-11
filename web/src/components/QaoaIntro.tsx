const WORDS = [
  { letter: 'Q', word: 'Quantum', text: 'Runs on qubits, using superposition and interference.' },
  { letter: 'A', word: 'Approximate', text: 'Aims for a very good answer, not a guaranteed perfect one.' },
  { letter: 'O', word: 'Optimization', text: 'Built for "find the best combination" problems: yes/no choices plus a score.' },
  { letter: 'A', word: 'Algorithm', text: 'A recipe: build a quantum program (a “circuit”), run it, let a normal computer tune it, repeat.' },
]

export function QaoaIntro() {
  return (
    <section className="section" aria-labelledby="qaoa-title">
      <div className="section-head">
        <h2 id="qaoa-title">So what is QAOA?</h2>
        <p>
          Proposed in 2014 by physicists Edward Farhi, Jeffrey Goldstone and Sam Gutmann, it is one of the most studied
          algorithms for today's quantum computers. The name says what it does:
        </p>
      </div>
      <div className="acronym">
        {WORDS.map((w, i) => (
          <div className="acronym-part" key={i}>
            <span className="acronym-letter" aria-hidden>{w.letter}</span>
            <h3>{w.word}</h3>
            <p>{w.text}</p>
          </div>
        ))}
      </div>
      <p className="section-foot">
        In one sentence: <strong>QAOA turns a question into a quantum circuit whose most likely outputs are good
        answers.</strong>
      </p>
    </section>
  )
}
