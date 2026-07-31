import { useState } from 'react'

/**
 * A SMALL CARD POINTING AT ONE CONTROL, SAYING WHAT IT IS FOR.
 *
 * Shown only in the moment the control needs explaining, which each caller decides for itself: no
 * campaigns yet, no brand card on the board yet. It is not a tour and there is no sequence. A
 * first-run walkthrough was built and removed, because the priority is the flow itself rather than
 * surfaces wrapped around it, and this is the smallest thing that answers "what is that button for"
 * without becoming another thing to maintain.
 *
 * ANCHORED IN THE LAYOUT, NOT MEASURED. The caller wraps the control in a positioned element and
 * drops this inside it, so the card tracks its control through resize, zoom, the rail opening, and
 * the canvas panning, with no measurement, no observer and nothing recomputed on scroll. The tour
 * that preceded this measured getBoundingClientRect on resize and scroll and needed a
 * MutationObserver to notice its target appearing; anchoring in the layout removes all of it.
 *
 * Dismissed forever on close, per key, because a hint you have read is noise the second time.
 */

export interface HintProps {
  /** Whether the moment this hint is for is happening. The caller owns that question. */
  show: boolean
  /** Persistence key, so two hints are dismissed independently. */
  storageKey: string
  title: string
  /** One or two short paragraphs. Two is the most that still gets read. */
  body: string[]
  /**
   * Which side of the control the card sits on, and therefore where its arrow points. 'below' hangs
   * under a header button, 'above' sits over a toolbar pinned to the bottom of the canvas.
   */
  placement?: 'below' | 'above'
  /** Horizontal alignment against the wrapper. Right suits a header, centre suits a toolbar. */
  align?: 'right' | 'center'
  /**
   * Optional action that does the thing the card describes.
   *
   * Dismisses on click, because a person who took the action has read the card, and a hint still
   * pointing at a button you just pressed is the second-time noise this whole component avoids.
   */
  cta?: { label: string; onClick: () => void }
}

function seen(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function Hint({ show, storageKey, title, body, placement = 'below', align = 'right', cta }: HintProps) {
  const [dismissed, setDismissed] = useState(() => seen(storageKey))
  if (!show || dismissed) return null
  const close = () => {
    setDismissed(true)
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      /* private mode: showing it again next time is not worth failing over */
    }
  }
  return (
    <div className={`nc-hint place-${placement} align-${align}`} role="note">
      <span className="nc-hint-arrow" />
      <div className="nc-hint-head">
        <span className="nc-hint-title">{title}</span>
        <button className="nc-hint-x" onClick={close} aria-label="Dismiss">
          ✕
        </button>
      </div>
      {body.map((p) => (
        <p className="nc-hint-body" key={p}>
          {p}
        </p>
      ))}
      {cta && (
        <div className="nc-hint-foot">
          <button
            className="btn primary nc-hint-cta"
            onClick={() => {
              close()
              cta.onClick()
            }}
          >
            {cta.label}
          </button>
        </div>
      )}
    </div>
  )
}
