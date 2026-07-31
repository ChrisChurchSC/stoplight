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
  arrow: 'top' | 'bottom' | 'left' | 'right' | null
  /** Offset of the arrow along the card's edge. Horizontal for top/bottom, vertical for left/right. */
  arrowLeft: number
  /** False while a step that wants an anchor has not found one, so the card can say why. */
  anchored: boolean
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
        setPlace({
          top: Math.max(24, (window.innerHeight - h) / 2),
          left: (window.innerWidth - CARD_W) / 2,
          arrow: null,
          arrowLeft: 0,
          anchored: !step.anchor,
        })
        return
      }
      /**
       * Below, above, or beside, in that order of preference.
       *
       * Beside is not a nicety: the assistant is a full-height side panel, so there is never room
       * above or below it, and an above/below-only version lands the card ON TOP of the thing it is
       * pointing at. Toolbars sit at the bottom and take "above"; panels take "beside".
       */
      const clampY = (y: number) => Math.min(Math.max(16, y), Math.max(16, window.innerHeight - h - 16))
      const clampX = (x: number) => Math.min(Math.max(16, x), Math.max(16, window.innerWidth - CARD_W - 16))

      if (r.bottom + GAP + h < window.innerHeight - 16) {
        const left = clampX(r.left + r.width / 2 - CARD_W / 2)
        setPlace({ top: r.bottom + GAP, left, arrow: 'top', arrowLeft: r.left + r.width / 2 - left, anchored: true })
      } else if (r.top - GAP - h > 16) {
        const left = clampX(r.left + r.width / 2 - CARD_W / 2)
        setPlace({ top: r.top - GAP - h, left, arrow: 'bottom', arrowLeft: r.left + r.width / 2 - left, anchored: true })
      } else {
        // To the right when it fits, otherwise to the left. The arrow runs down the card's edge.
        const toRight = r.right + GAP + CARD_W < window.innerWidth - 16
        const left = toRight ? r.right + GAP : Math.max(16, r.left - GAP - CARD_W)
        const top = clampY(r.top + r.height / 2 - h / 2)
        setPlace({ top, left, arrow: toRight ? 'left' : 'right', arrowLeft: r.top + r.height / 2 - top, anchored: true })
      }
    }
    compute()
    window.addEventListener('resize', compute)
    // Capture phase: most scrolling here happens inside panels, not on window, and those do not bubble.
    window.addEventListener('scroll', compute, true)

    /**
     * Watch for the anchor arriving.
     *
     * Steps 3 to 5 describe things that only exist inside a campaign, so when the card first shows
     * its target is not in the document at all. Without this the card would sit in the middle
     * talking about a Generate button that appears a moment later and never move to it.
     *
     * Only runs while an anchor is genuinely missing, and coalesces to one measurement per frame.
     * A permanent whole-document observer in an app with a live canvas would fire constantly for
     * nothing; this one stops itself as soon as the element it is waiting for exists.
     */
    let obs: MutationObserver | null = null
    if (step.anchor && !document.querySelector(step.anchor)) {
      let queued = false
      obs = new MutationObserver(() => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
          queued = false
          compute()
          if (step.anchor && document.querySelector(step.anchor)) {
            obs?.disconnect()
            obs = null
          }
        })
      })
      obs.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
      obs?.disconnect()
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
      {place?.arrow && (
        <span
          className="tour-arrow"
          style={
            place.arrow === 'left' || place.arrow === 'right'
              ? { top: place.arrowLeft }
              : { left: place.arrowLeft }
          }
        />
      )}
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
        {place && !place.anchored && step.waitingFor && <p className="tour-waiting">{step.waitingFor}</p>}
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
