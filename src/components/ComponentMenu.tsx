import { useEffect, useRef, useState } from 'react'
import type { SmartObjectScope } from '../domain/smartObject'

/**
 * THE COMPONENT CONTROL: one icon, in the panel head, that says whether this is a component and is
 * the way to make it one, move it between rungs, or detach it.
 *
 * It replaces a control that VANISHED ON USE. Making a component turned the card into a placement,
 * which the icon's own condition then read as "nothing to convert", so the button you had just
 * pressed disappeared and you were looking at a different panel with different controls. Nothing
 * said what had happened. A toggle that reports state must survive the state changing.
 *
 * TWO ICON STATES, NOT FOUR. Outline means "not a component", filled means "is one", and the RUNG is
 * named in words — in this menu's header, and in the panel's own line underneath. Three rungs encoded
 * as fills and rings is a code that has to be learnt, fails outright for anyone who cannot separate
 * the colours, and buys nothing the sentence "Shared with every brand" does not already say better.
 */
export type ComponentRung = SmartObjectScope

const RUNGS: { scope: ComponentRung; label: string; hint: string }[] = [
  { scope: 'campaign', label: 'Just this campaign', hint: 'Only this board can use it' },
  { scope: 'brand', label: 'This brand', hint: 'Every campaign for this brand' },
  { scope: 'shared', label: 'Every brand', hint: 'Any campaign, whoever it belongs to' },
]

const RUNG_WORD: Record<ComponentRung, string> = {
  campaign: 'this campaign',
  brand: 'this brand',
  shared: 'every brand',
}

export function ComponentMenu({
  scope,
  canUseBrand,
  onMake,
  onMove,
  onOpen,
  onDetach,
}: {
  /** The rung it is on, or undefined when it is not a component yet. */
  scope?: ComponentRung
  /** False when no brand is in view, which is the one rung that needs one to land in. */
  canUseBrand: boolean
  onMake: (scope: ComponentRung) => void
  onMove: (scope: ComponentRung) => void
  onOpen: () => void
  /**
   * Spills the cards back onto the board and leaves the component in the library. Non-destructive:
   * the members survive, which is what makes "use one as a base, detach, edit, make a new one" work.
   * So it is not confirmed — a confirm would tax that path to warn about something that is not lost.
   */
  onDetach: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const isComponent = !!scope

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  const act = (fn: () => void) => () => { setOpen(false); fn() }

  return (
    <span className="flow-cmp" ref={wrap}>
      <button
        className={`flow-panel-action flow-cmp-btn${isComponent ? ' on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={isComponent ? `Component · ${RUNG_WORD[scope]}` : 'Make this a component'}
        aria-label={isComponent ? `Component, ${RUNG_WORD[scope]}` : 'Make this a component'}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Two diamonds, one inside the other: an instance of a thing. Filled once it IS one, so the
            board's own vocabulary reads at a glance without anyone learning a colour. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4 20 12 12 20 4 12z" fill={isComponent ? 'currentColor' : 'none'} />
          <path d="M12 9 15 12 12 15 9 12z" fill={isComponent ? 'var(--surface)' : 'none'} stroke={isComponent ? 'var(--surface)' : 'currentColor'} />
        </svg>
      </button>
      {open && (
        <div className="flow-cmp-menu" role="menu">
          {isComponent ? (
            <>
              {/* The rung, in words, at the top. This is the fact the icon deliberately does not
                  carry, so it has to be the first thing here. */}
              <div className="flow-cmp-menu-head">Component · {RUNG_WORD[scope]}</div>
              {RUNGS.filter((r) => r.scope !== scope).map((r) => (
                <button
                  key={r.scope}
                  className="flow-ctx-item"
                  role="menuitem"
                  disabled={r.scope === 'brand' && !canUseBrand}
                  onClick={act(() => onMove(r.scope))}
                >
                  Move to {r.label.toLowerCase()}
                  <span className="flow-cmp-menu-hint">{r.hint}</span>
                </button>
              ))}
              <button className="flow-ctx-item" role="menuitem" onClick={act(onOpen)}>Open it</button>
              <div className="flow-cmp-menu-sep" />
              <button className="flow-ctx-item" role="menuitem" onClick={act(onDetach)}>
                Detach here
                <span className="flow-cmp-menu-hint">Cards stay on this board; the component stays in the library</span>
              </button>
            </>
          ) : (
            <>
              <div className="flow-cmp-menu-head">Make it a component</div>
              {RUNGS.map((r) => (
                <button
                  key={r.scope}
                  className="flow-ctx-item"
                  role="menuitem"
                  disabled={r.scope === 'brand' && !canUseBrand}
                  onClick={act(() => onMake(r.scope))}
                >
                  {r.label}
                  <span className="flow-cmp-menu-hint">{r.hint}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </span>
  )
}
