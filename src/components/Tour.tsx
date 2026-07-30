import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DEFAULT_TOUR, TOUR_STEPS, type TourState } from '../domain/tour'

/**
 * The first-run tour: one card at a time, dismissible, and it never blocks the app behind it.
 *
 * NOT A MODAL, deliberately. There is no scrim and no focus trap, because the point of the card is
 * to talk about the screen you can see. Dimming that screen to explain it is self defeating, and a
 * person who wants to ignore the tour and start clicking should be able to.
 *
 * WHERE IT SITS. Centred by default. When a step names an anchor and that element is on screen, the
 * card moves next to it and grows a small arrow pointing at it. If the selector matches nothing, the
 * card centres instead of pointing at empty space, so a renamed surface downgrades the step rather
 * than breaking it.
 *
 * IT REMEMBERS. Closing halfway and coming back resumes on the same card; finishing or closing marks
 * it done and it does not return. resetTour() in the console puts it back, which is what a demo
 * rehearsal needs.
 */

const TOUR_KEY = 'stoplight.tour.v1'

function loadTour(): TourState {
  try {
    const raw = JSON.parse(localStorage.getItem(TOUR_KEY) || 'null')
    if (!raw || typeof raw !== 'object') return DEFAULT_TOUR
    const step = Number((raw as TourState).step)
    return {
      step: Number.isInteger(step) && step >= 0 && step < TOUR_STEPS.length ? step : 0,
      done: !!(raw as TourState).done,
    }
  } catch {
    return DEFAULT_TOUR
  }
}

function saveTour(next: TourState): void {
  try {
    localStorage.setItem(TOUR_KEY, JSON.stringify(next))
  } catch {
    /* private mode / quota: the tour showing twice is not worth failing over */
  }
}

/** Put the tour back to the start. Exposed on window so a demo can be rehearsed from a clean slate. */
export function resetTour(): void {
  saveTour(DEFAULT_TOUR)
  window.location.reload()
}

// Reachable as resetTour() from the console. The tour is a first-run thing, so the only way to see
// it again is to reset it, and rehearsing a demo means seeing it more than once.
declare global {
  interface Window {
    resetTour?: () => void
  }
}
if (typeof window !== 'undefined') window.resetTour = resetTour

interface Placement {
  top: number
  left: number
  /** Which edge the arrow sits on, or null when the card is centred and has no arrow. */
  arrow: 'top' | 'bottom' | null
  arrowLeft: number
}

const CARD_W = 380
const GAP = 14

export function Tour() {
  const [state, setState] = useState<TourState>(loadTour)
  const [place, setPlace] = useState<Placement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  const step = TOUR_STEPS[state.step]
  const isLast = state.step === TOUR_STEPS.length - 1

  const finish = useCallback(() => {
    const next = { step: state.step, done: true }
    setState(next)
    saveTour(next)
  }, [state.step])

  const advance = useCallback(() => {
    if (isLast) return finish()
    const next = { step: state.step + 1, done: false }
    setState(next)
    saveTour(next)
  }, [isLast, finish, state.step])

  const back = useCallback(() => {
    if (state.step === 0) return
    const next = { step: state.step - 1, done: false }
    setState(next)
    saveTour(next)
  }, [state.step])

  /**
   * Position against the anchor, or centre.
   *
   * useLayoutEffect rather than useEffect: the card is measured to place it, and doing that after
   * paint shows it in the wrong spot for a frame, which reads as a jump every time you press Next.
   */
  useLayoutEffect(() => {
    if (state.done || !step) return
    const compute = () => {
      const card = cardRef.current
      const h = card?.offsetHeight ?? 220
      const el = step.anchor ? document.querySelector(step.anchor) : null
      const r = el?.getBoundingClientRect()
      // An element that is present but scrolled out of view is no better than a missing one.
      const visible = r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight
      if (!visible || !r) {
        setPlace({ top: Math.max(24, (window.innerHeight - h) / 2), left: (window.innerWidth - CARD_W) / 2, arrow: null, arrowLeft: 0 })
        return
      }
      // Below the anchor when there is room, above it when there is not.
      const below = r.bottom + GAP + h < window.innerHeight - 16
      const top = below ? r.bottom + GAP : Math.max(16, r.top - GAP - h)
      const rawLeft = r.left + r.width / 2 - CARD_W / 2
      const left = Math.min(Math.max(16, rawLeft), window.innerWidth - CARD_W - 16)
      setPlace({ top, left, arrow: below ? 'top' : 'bottom', arrowLeft: r.left + r.width / 2 - left })
    }
    compute()
    window.addEventListener('resize', compute)
    // Capture phase: most scrolling here happens inside panels, not on window, and those do not bubble.
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [state.step, state.done, step])

  /**
   * Escape closes the tour, and that is the only key it takes.
   *
   * Arrow keys would be the obvious addition and they are a trap: this listener is on the window,
   * and the canvas uses the arrows to nudge selected cards. A tour that quietly steals them breaks
   * a real interaction to save a click on a button that is already on screen.
   *
   * The event is deliberately NOT stopped. Escape usually means "close the thing in front of me",
   * and swallowing it here would leave a drawer open underneath while the tour disappeared.
   */
  useEffect(() => {
    if (state.done) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.done, finish])

  if (state.done || !step) return null

  return (
    <div
      className={`tour-card${place?.arrow ? ` arrow-${place.arrow}` : ''}`}
      ref={cardRef}
      style={{
        top: place?.top ?? -9999,
        left: place?.left ?? -9999,
        // Hidden until measured, so it never flashes in the wrong place on the first frame.
        visibility: place ? 'visible' : 'hidden',
      }}
      role="dialog"
      aria-label={step.title}
    >
      {place?.arrow && <span className="tour-arrow" style={{ left: place.arrowLeft }} />}
      <div className="tour-head">
        <span className="tour-title">{step.title}</span>
        <button className="tour-x" onClick={finish} aria-label="Close the tour">
          ✕
        </button>
      </div>
      <div className="tour-body">
        {step.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <div className="tour-foot">
        <span className="tour-count">
          {state.step + 1} of {TOUR_STEPS.length}
        </span>
        <div className="tour-actions">
          {state.step > 0 && (
            <button className="btn tour-back" onClick={back}>
              Back
            </button>
          )}
          <button className="btn primary" onClick={advance}>
            {isLast ? step.cta ?? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
