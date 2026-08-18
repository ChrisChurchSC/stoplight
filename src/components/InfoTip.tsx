import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { GLOSSARY } from '../domain/glossary'

/**
 * The single in-product definition primitive. An inline "i" button that reveals a glossary
 * definition on hover, click, or keyboard focus. The panel is rendered in a portal with fixed
 * positioning so it escapes the record tables' overflow scroll wrappers and the sidebar; while
 * open it follows scroll/resize and flips above the button near the viewport bottom. Renders
 * nothing if the term is unknown, so a stray key is a no-op rather than a blank popover.
 */
const PANEL_W = 300
/**
 * The first guess at the panel's height, used only for the frame before it has been measured.
 *
 * It used to be the WHOLE flip decision, which held for as long as every entry was two paragraphs.
 * A term whose definition is a list runs to twice this, so a guess put the panel below a button near
 * the foot of a tall panel and let it run off the bottom of the window, with the lines that were the
 * reason for opening it the ones underneath the fold. It is measured after paint now; this is what
 * gets used for the one frame before that.
 */
const EST_H = 168

export function InfoTip({ term }: { term: string }) {
  const entry = GLOSSARY[term]
  const panelId = useId()
  const btnRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const popRef = useRef<HTMLDivElement>(null)
  /**
   * Below the button when it fits, above when it does not, and never off either edge of the window.
   * `h` is the panel's real height once there is a panel to measure, and the estimate before that.
   */
  const place = (h = popRef.current?.getBoundingClientRect().height || EST_H) => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const below = r.bottom + h + 8 <= window.innerHeight
    setPos({
      // Clamped to the window even when neither side fits, so a panel taller than the viewport is
      // scrolled to rather than cut off at the top.
      top: Math.round(Math.max(8, below ? r.bottom + 8 : Math.min(r.top - h - 8, window.innerHeight - h - 8))),
      left: Math.round(Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8))),
    })
  }
  const show = () => {
    window.clearTimeout(closeTimer.current)
    place()
    setOpen(true)
  }
  const hide = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 220)
  }

  // While open: follow scroll/resize (record tables sit in overflow scrollers) and let Escape close
  // the tip even when the panel, not the button, holds the pointer/focus.
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      place()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // MEASURE, THEN PLACE PROPERLY. The first paint uses the estimate; this corrects it with the real
  // height on the same frame, so a long entry flips above instead of running off the bottom.
  useLayoutEffect(() => {
    if (!open) return
    const h = popRef.current?.getBoundingClientRect().height
    if (h) place(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Never leave a close timer running after unmount.
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  if (!entry) return null
  const seeAlso = (entry.seeAlso ?? []).map((k) => GLOSSARY[k]?.term).filter(Boolean)

  return (
    <span className="infotip" onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={btnRef}
        type="button"
        className="infotip-btn"
        aria-label={`What is ${entry.term}?`}
        aria-describedby={open ? panelId : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          open ? setOpen(false) : show()
        }}
        onFocus={show}
        onBlur={hide}
      >
        i
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            id={panelId}
            className="infotip-pop"
            role="tooltip"
            style={{ top: pos.top, left: pos.left } as CSSProperties}
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            <div className="infotip-term">{entry.term}</div>
            <div className="infotip-short">{entry.short}</div>
            {entry.more && <div className="infotip-more">{entry.more}</div>}
            {/* A real list, so a definition whose content is "here are the N things" can be scanned
                for the one line you came for instead of read as a paragraph twice. */}
            {entry.points && entry.points.length > 0 && (
              <ul className="infotip-points">
                {entry.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {seeAlso.length > 0 && <div className="infotip-see">See also: {seeAlso.join(', ')}</div>}
          </div>,
          document.body,
        )}
    </span>
  )
}
