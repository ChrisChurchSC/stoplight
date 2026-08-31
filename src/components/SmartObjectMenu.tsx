import { useEffect, useRef, useState } from 'react'
import type { SmartObjectScope } from '../domain/smartObject'

/**
 * THE SMART OBJECT CONTROL: one icon, in the panel head, that says whether this IS one and is the way
 * to make it one, move it between rungs, or detach it.
 *
 * "Smart object" throughout, not "component". The two words were both on screen for a while — this
 * menu said one and the library said the other — and one thing with two names is two things to
 * anybody who has not been told otherwise. The codebase, the glossary and the storage all say smart
 * object, so that is the one that wins.
 *
 * It replaces a control that VANISHED ON USE. Making one turned the card into a placement,
 * which the icon's own condition then read as "nothing to convert", so the button you had just
 * pressed disappeared and you were looking at a different panel with different controls. Nothing
 * said what had happened. A toggle that reports state must survive the state changing.
 *
 * TWO ICON STATES, NOT FOUR. Outline means "not one yet", filled means "is one", and the RUNG is
 * named in words — in this menu's header, and in the panel's own line underneath. Three rungs encoded
 * as fills and rings is a code that has to be learnt, fails outright for anyone who cannot separate
 * the colours, and buys nothing the sentence "Shared with every brand" does not already say better.
 */
export type Rung = SmartObjectScope

const RUNGS: { scope: Rung; label: string; hint: string }[] = [
  { scope: 'campaign', label: 'Just this campaign', hint: 'Only this board can use it' },
  { scope: 'brand', label: 'This brand', hint: 'Every campaign for this brand' },
  { scope: 'shared', label: 'Every brand', hint: 'Any campaign, whoever it belongs to' },
]

const RUNG_WORD: Record<Rung, string> = {
  campaign: 'this campaign',
  brand: 'this brand',
  shared: 'every brand',
}

export function SmartObjectMenu({
  scope,
  canUseBrand,
  onMake,
  onMove,
  onOpen,
  onDetach,
}: {
  /** The rung it is on, or undefined when it is not a smart object yet. */
  scope?: Rung
  /** False when no brand is in view, which is the one rung that needs one to land in. */
  canUseBrand: boolean
  onMake: (scope: Rung) => void
  onMove: (scope: Rung) => void
  /**
   * Opens the object's OWN TAB, which is the only place its contents can be changed.
   *
   * This used to step into the object on the board itself. That made the board an editing surface
   * for something shared: a tweak made while thinking about one campaign rewrote the definition, and
   * every other campaign using it changed with no sign that anything had happened. Editing now
   * happens in one place, away from any single campaign, which is the whole reason the library
   * exists. `onDetach` is the way to make a change that belongs to THIS board only.
   */
  onOpen: () => void
  /**
   * Spills the cards back onto the board and leaves the smart object in the library. Non-destructive:
   * the members survive, which is what makes "use one as a base, detach, edit, make a new one" work.
   * So it is not confirmed — a confirm would tax that path to warn about something that is not lost.
   */
  onDetach: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const isSmart = !!scope

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
    <span className="flow-so" ref={wrap}>
      <button
        className={`flow-panel-action flow-so-btn${isSmart ? ' on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={isSmart ? `Smart object · ${RUNG_WORD[scope]}` : 'Make this a smart object'}
        aria-label={isSmart ? `Smart object, ${RUNG_WORD[scope]}` : 'Make this a smart object'}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Two diamonds, one inside the other: an instance of a thing. Filled once it IS one, so the
            board's own vocabulary reads at a glance without anyone learning a colour. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4 20 12 12 20 4 12z" fill={isSmart ? 'currentColor' : 'none'} />
          <path d="M12 9 15 12 12 15 9 12z" fill={isSmart ? 'var(--surface)' : 'none'} stroke={isSmart ? 'var(--surface)' : 'currentColor'} />
        </svg>
      </button>
      {open && (
        <div className="flow-so-menu" role="menu">
          {isSmart ? (
            <>
              {/* The rung, in words, at the top. This is the fact the icon deliberately does not
                  carry, so it has to be the first thing here. */}
              <div className="flow-so-menu-head">Smart object · {RUNG_WORD[scope]}</div>
              {RUNGS.filter((r) => r.scope !== scope).map((r) => (
                <button
                  key={r.scope}
                  className="flow-ctx-item"
                  role="menuitem"
                  disabled={r.scope === 'brand' && !canUseBrand}
                  onClick={act(() => onMove(r.scope))}
                >
                  Move to {r.label.toLowerCase()}
                  <span className="flow-so-menu-hint">{r.hint}</span>
                </button>
              ))}
              <button className="flow-ctx-item" role="menuitem" onClick={act(onOpen)}>
                Edit smart object
                <span className="flow-so-menu-hint">Changes reach every campaign using it</span>
              </button>
              <div className="flow-so-menu-sep" />
              <button className="flow-ctx-item" role="menuitem" onClick={act(onDetach)}>
                Detach here
                <span className="flow-so-menu-hint">Cards stay on this board; the smart object stays in the library</span>
              </button>
            </>
          ) : (
            <>
              <div className="flow-so-menu-head">Make it a smart object</div>
              {RUNGS.map((r) => (
                <button
                  key={r.scope}
                  className="flow-ctx-item"
                  role="menuitem"
                  disabled={r.scope === 'brand' && !canUseBrand}
                  onClick={act(() => onMake(r.scope))}
                >
                  {r.label}
                  <span className="flow-so-menu-hint">{r.hint}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </span>
  )
}
