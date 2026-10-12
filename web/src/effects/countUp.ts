/** Number count-up helpers. Pure functions, so they are easy to test. */

// A whole-string number such as "6", "36.3%", "$126,176" or "+12.5%". Anything else is left alone.
const NUMBER = /^([$+-]*)(\d[\d,]*(?:\.\d+)?)(%?)$/

export function parseCount(text: string): { target: number; format: (value: number) => string } | null {
  const m = NUMBER.exec(text.trim())
  if (!m) return null
  const [, prefix, digits, suffix] = m
  const target = parseFloat(digits.replace(/,/g, ''))
  const decimals = digits.includes('.') ? digits.split('.')[1].length : 0
  const commas = digits.includes(',')
  const format = (value: number) => {
    const body = commas
      ? value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : value.toFixed(decimals)
    return `${prefix}${body}${suffix}`
  }
  return { target, format }
}

/** Counts a single text node up from zero. If React changes the text meanwhile, it stops and leaves React's value. */
export function countUp(node: Text, duration = 1100) {
  const final = node.nodeValue ?? ''
  const parsed = parseCount(final)
  if (!parsed) return
  let last = parsed.format(0)
  node.nodeValue = last
  const started = performance.now()
  const tick = (now: number) => {
    if (node.nodeValue !== last) return
    const t = Math.min(1, (now - started) / duration)
    last = t === 1 ? final : parsed.format(parsed.target * (1 - Math.pow(1 - t, 3)))
    node.nodeValue = last
    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}