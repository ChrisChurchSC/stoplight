import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTrafficStore } from '../store/useTrafficStore'
import { TOUR_STEPS, TOUR_KEY } from '../domain/tour'

const POP_W = 320
const POP_H = 168

const isDone = (): boolean => {
  try {
    return localStorage.getItem(TOUR_KEY) === '1'
  } catch {
    return true
  }
}

/**
 * A tiny self-contained coach-mark tour (no external lib): highlights a few Home anchors with a
 * fixed tooltip and Next / Skip. Fires once for a first-time user, gracefully skips any anchor that
 * isn't on screen, and persists a done flag so it never returns.
 */
export function Tour() {
  const page = useTrafficStore((s) => s.page)
  const [active, setActive] = useState(false)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const finish = () => {
    try {
      localStorage.setItem(TOUR_KEY, '1')
    } catch {
      /* ignore */
    }
    setActive(false)
  }
  const next = () => (i + 1 >= TOUR_STEPS.length ? finish() : setI(i + 1))

  // Start once, on Home, after the anchors have had a moment to render, and never before the
  // first-run "about you" sequence is resolved: the tour used to draw straight over it, spotlight
  // and all. One first-run surface at a time.
  const onboardedAt = useTrafficStore((s) => s.userPrefs.onboardedAt)
  useEffect(() => {
    if (onboardedAt == null || isDone() || page !== 'portfolio' || active) return
    const t = window.setTimeout(() => {
      if (!isDone() && document.querySelector(TOUR_STEPS[0].sel)) {
        setI(0)
        setActive(true)
      }
    }, 900)
    return () => window.clearTimeout(t)
  }, [page, active, onboardedAt])

  // Skip steps whose anchor is missing; measure the current anchor and keep it measured on scroll/resize.
  useLayoutEffect(() => {
    if (!active) return
    let idx = i
    while (idx < TOUR_STEPS.length && !document.querySelector(TOUR_STEPS[idx].sel)) idx++
    if (idx >= TOUR_STEPS.length) {
      finish()
      return
    }
    if (idx !== i) {
      setI(idx)
      return
    }
    const el = document.querySelector(TOUR_STEPS[idx].sel) as HTMLElement | null
    if (!el) return
    const measure = () => setRect(el.getBoundingClientRect())
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, i])

  if (!active || !rect) return null
  const step = TOUR_STEPS[i]
  const below = rect.bottom + POP_H + 16 <= window.innerHeight
  const top = Math.round(below ? rect.bottom + 12 : Math.max(12, rect.top - POP_H - 12))
  const left = Math.round(Math.max(12, Math.min(rect.left, window.innerWidth - POP_W - 12)))

  return createPortal(
    <div className="tour-layer">
      <div
        className="tour-ring"
        style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }}
        aria-hidden="true"
      />
      <div className="tour-pop" style={{ top, left, width: POP_W }} role="dialog" aria-label={step.title}>
        <div className="tour-step-n">
          {i + 1} of {TOUR_STEPS.length}
        </div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-body">{step.body}</div>
        <div className="tour-actions">
          <button className="tour-skip" onClick={finish}>
            Skip
          </button>
          <button className="tour-next" onClick={next}>
            {i + 1 >= TOUR_STEPS.length ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
