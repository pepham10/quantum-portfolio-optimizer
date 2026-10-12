import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { countUp, parseCount } from './countUp'
import './effects.css'

/**
 * Motion layer: start-up animation, scroll reveals, ambient glow and a reading-progress bar.
 * It never edits React-managed markup. Reveals use data attributes that React does not touch, so
 * re-renders cannot undo them. Everything is skipped for people who ask for reduced motion.
 */

const KEY = 'qpl-intro'
const REDUCED = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Plays once per browser tab. Add ?intro to the address to replay it.
const PLAY_INTRO = (() => {
  if (REDUCED) return false
  try {
    return new URLSearchParams(location.search).has('intro') || !sessionStorage.getItem(KEY)
  } catch {
    return true
  }
})()

let finishIntro: () => void = () => {}
const introDone = new Promise<void>((resolve) => {
  finishIntro = () => {
    try { sessionStorage.setItem(KEY, '1') } catch { /* private mode: fine */ }
    resolve()
  }
  if (!PLAY_INTRO) resolve()
})

// What fades in as you scroll: text blocks, cards and the footer. '.section' itself only gets its divider drawn.
const BLOCKS = '.intro > *, .section-head > *, .section > :not(.section-head), .result > *, .error-box, footer'
// Big numbers that count up from zero the first time they scroll into view (only plain numbers qualify; see countUp.ts).
const COUNTERS = '.big-number, .fact-value'
const SELECTOR = `${BLOCKS}, .section, ${COUNTERS}`

const isCounter = (el: Element) =>
  el.matches(COUNTERS) && el.childNodes.length === 1 && el.firstChild?.nodeType === 3 && parseCount(el.textContent ?? '') !== null

function useScrollReveal() {
  useLayoutEffect(() => {
    if (REDUCED || typeof IntersectionObserver === 'undefined') return
    const root = document.documentElement
    root.classList.add('fx')
    let io: IntersectionObserver | null = null

    const scan = (node: Element) => {
      const found = node.matches(SELECTOR) ? [node, ...node.querySelectorAll(SELECTOR)] : [...node.querySelectorAll(SELECTOR)]
      for (const el of found as HTMLElement[]) {
        if (el.matches(COUNTERS)) {
          if (isCounter(el)) el.dataset.count = ''
          else continue
        } else if (!el.matches('.section') && el.dataset.reveal === undefined) {
          el.dataset.reveal = ''
          const i = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0
          el.style.setProperty('--d', `${Math.min(i, 6) * 70}ms`)
        }
        io?.observe(el)
      }
    }

    scan(document.body) // before first paint, so nothing flashes visible and then hides

    const mo = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => n instanceof Element && scan(n))
    })
    mo.observe(document.body, { childList: true, subtree: true })

    let cancelled = false
    let delivered = 0
    introDone.then(() => {
      if (cancelled) return
      io = new IntersectionObserver(
        (entries) => {
          delivered += entries.length
          for (const e of entries) {
            if (!e.isIntersecting) continue
            const el = e.target as HTMLElement
            if (el.dataset.count !== undefined) {
              el.setAttribute('data-counted', '')
              if (el.firstChild?.nodeType === 3) countUp(el.firstChild as Text)
            } else {
              el.setAttribute(el.matches('.section') ? 'data-seen' : 'data-revealed', '')
            }
            io?.unobserve(el)
          }
        },
        { rootMargin: '0px 0px -8% 0px' },
      )
      document.querySelectorAll(SELECTOR).forEach((el) => io!.observe(el))
      // Safety net: if the browser never reports anything, show the content rather than leave it hidden.
      setTimeout(() => {
        if (cancelled || delivered) return
        document.querySelectorAll('[data-reveal]').forEach((el) => el.setAttribute('data-revealed', ''))
        document.querySelectorAll('[data-count]').forEach((el) => el.setAttribute('data-counted', ''))
        document.querySelectorAll('.section').forEach((el) => el.setAttribute('data-seen', ''))
      }, 3000)
    })

    return () => {
      cancelled = true
      mo.disconnect()
      io?.disconnect()
      root.classList.remove('fx')
    }
  }, [])
}

/** Soft light that follows the pointer across cards. One listener for the whole page; skipped on touch screens. */
function useSpotlight() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return
    let raf = 0
    let last: PointerEvent | null = null
    const paint = () => {
      raf = 0
      const card = (last?.target as Element | null)?.closest?.<HTMLElement>('.panel, .mini-figure, .vision > div')
      if (!card || !last) return
      const r = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${last.clientX - r.left}px`)
      card.style.setProperty('--my', `${last.clientY - r.top}px`)
    }
    const move = (e: PointerEvent) => {
      last = e
      if (!raf) raf = requestAnimationFrame(paint)
    }
    document.addEventListener('pointermove', move, { passive: true })
    return () => {
      document.removeEventListener('pointermove', move)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
}

function Progress() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const h = document.documentElement
      const max = h.scrollHeight - h.clientHeight
      ref.current?.style.setProperty('--p', String(max > 0 ? Math.min(1, h.scrollTop / max) : 0))
      if (h.scrollTop < 1000) document.querySelector<HTMLElement>('.intro')?.style.setProperty('--sy', String(h.scrollTop))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return <div ref={ref} className="fx-progress" aria-hidden />
}

function Intro() {
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('in')

  useEffect(() => {
    if (phase === 'in') {
      const t = setTimeout(() => setPhase('out'), 2300)
      return () => clearTimeout(t)
    }
    if (phase === 'out') {
      finishIntro() // the page content starts revealing as the overlay fades
      const t = setTimeout(() => setPhase('gone'), 650)
      return () => clearTimeout(t)
    }
  }, [phase])

  useEffect(() => {
    const skip = () => setPhase((p) => (p === 'in' ? 'out' : p))
    window.addEventListener('keydown', skip)
    return () => window.removeEventListener('keydown', skip)
  }, [])

  if (phase === 'gone') return null
  return (
    <div className="fx-intro" data-phase={phase} onClick={() => setPhase((p) => (p === 'in' ? 'out' : p))} aria-hidden>
      <svg className="fx-mark" viewBox="0 0 120 120">
        <circle className="ring a" cx="60" cy="60" r="34" pathLength={1} />
        <g className="spin">
          <ellipse className="ring b" cx="60" cy="60" rx="52" ry="18" pathLength={1} transform="rotate(-24 60 60)" />
          <ellipse className="ring c" cx="60" cy="60" rx="48" ry="16" pathLength={1} transform="rotate(38 60 60)" />
          <ellipse className="ring d" cx="60" cy="60" rx="44" ry="14" pathLength={1} transform="rotate(100 60 60)" />
        </g>
        <circle cx="60" cy="60" r="4" fill="var(--color-accent)" />
      </svg>
      <div className="fx-word">Quantum Portfolio Lab</div>
      <div className="fx-rule" />
    </div>
  )
}

export default function Effects() {
  useScrollReveal()
  useSpotlight()
  return (
    <>
      <div className="fx-ambient" aria-hidden><i /><i /><i /></div>
      <Progress />
      {PLAY_INTRO && <Intro />}
    </>
  )
}