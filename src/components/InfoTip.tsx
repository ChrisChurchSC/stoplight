import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
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
const EST_H = 168 // conservative estimate for the flip decision (short + more + See also)

export function InfoTip({ term }: { term: string }) {
  const entry = GLOSSARY[term]
  const panelId = useId()
  const btnRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const below = r.bottom + EST_H + 8 <= window.innerHeight
    setPos({
      top: Math.round(below ? r.bottom + 8 : Math.max(8, r.top - EST_H - 8)),
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
      const below = r.bottom + EST_H + 8 <= window.innerHeight
      setPos({
        top: Math.round(below ? r.bottom + 8 : Math.max(8, r.top - EST_H - 8)),
        left: Math.round(Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8))),
      })
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
            {seeAlso.length > 0 && <div className="infotip-see">See also: {seeAlso.join(', ')}</div>}
          </div>,
          document.body,
        )}
    </span>
  )
}
