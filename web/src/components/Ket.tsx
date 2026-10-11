/** A measured bitstring shown as qubits: each stock reads 1 (buy) or 0 (skip). */
export function Ket({ bits, tickers }: { bits: string; tickers: string[] }) {
  return (
    <div className="ket" aria-label={`Measured qubits: ${tickers.map((t, i) => `${t} ${bits[i]}`).join(', ')}`}>
      {tickers.map((t, i) => (
        <div key={t} className={`qubit ${bits[i] === '1' ? 'on' : ''}`}>
          <span className="bit">{bits[i]}</span>
          <span className="name">{t}</span>
        </div>
      ))}
      <span className="ket-caption">1 = buy · 0 = skip</span>
    </div>
  )
}
