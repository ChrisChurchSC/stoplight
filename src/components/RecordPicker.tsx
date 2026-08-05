/**
 * THE PICKER ON AN OBJECT CARD — what the card is showing, and the list you change it from.
 *
 * WHAT THIS REPLACED: a native <select> of bare record names, sitting under a free-text "Name this
 * concept…" field. Two problems, one cause. The dropdown offered nothing but names, so choosing
 * between "Ladder", "Open loop" and "Third rail" meant already knowing what all three were; and
 * because the closed card then showed only that name, the card carried its own name field to make
 * up for it — a second place to write the same word, out of step with the record the moment either
 * changed.
 *
 * So the picker shows each record the way the rest of the app shows an object: the name, and the
 * one line underneath saying what it is (see recordDetail). Once picked, the card face IS that
 * row — which is what makes the card's own name field unnecessary rather than merely redundant.
 * Naming a card is still possible and still meaningful (two Audience cards on one board, and you
 * want to know which is the cold list) — it just moved to the inspector, where board-local
 * overrides belong.
 *
 * The rows deliberately do NOT repeat the kind the way the inspector's context list does. There
 * every row can be a different kind; here every option is the kind the card already announces in
 * its own header, and printing "CONCEPT" twenty times says nothing the header has not.
 */
import { useEffect, useRef, useState } from 'react'

export interface RecordOption {
  id: string
  label: string
  /** The record's own one line. Absent for kinds whose records carry none. */
  detail?: string
}

interface Props {
  /** The records available to pick, already scoped to the brand by the caller. */
  options: RecordOption[]
  /** The linked record, if any. */
  refId?: string
  /**
   * What the card reads as right now. NOT always the record's name: a card that has been named in
   * the inspector answers to that name everywhere (see objectName), and this is one of those
   * everywheres. Empty means nothing is picked and nothing was typed.
   */
  name: string
  /** The line under the name. The linked record's detail, resolved by the caller. */
  detail?: string
  /** The kind as a word, lowercase — "concept", "proof point". Used in every string here. */
  noun: string
  /** "a" or "an" for `noun`. The caller owns it, so this file holds no grammar of its own. */
  article: string
  /** The kind's hue, for the tick and the option glyph. */
  tone: string
  /** Plural of `noun`, for the empty state. The caller owns pluralisation. */
  plural: string
  /**
   * Why the list is empty, when it is. An empty library and an unbound brand are different
   * problems with different fixes, and only the caller knows which one this is.
   */
  emptyNote: string
  /** Whether this kind can be made from here. Not every kind can. */
  canCreate: boolean
  onPick: (id: string) => void
  onCreate: () => void
  /**
   * Called when the list opens. The card's own click handler cannot do this any more — every event
   * in here is stopped before it reaches the canvas, or picking a record would also toggle the
   * card's selection behind the menu — so selecting the card you are editing is passed in instead.
   * Reaching for the picker IS looking at that card, and the inspector should be showing it.
   */
  onOpen: () => void
}

/** Above this many, scanning beats reading, and a filter box earns its line. */
const SEARCH_FROM = 7

export function RecordPicker({ options, refId, name, detail, noun, article, tone, plural, emptyNote, canCreate, onPick, onCreate, onOpen }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)

  /**
   * CLOSING: a press anywhere that is not this picker, and Escape.
   *
   * Both listen in the CAPTURE phase, which is the only place early enough to be useful. A canvas
   * card starts its drag on mousedown, so a listener that waits for the click has already let the
   * board act on a press the person meant as "put this list away".
   *
   * NOT A SCRIM, which is the obvious way to do this and does not work here: every card carries an
   * inline transform, so a fixed-position child is contained by the CARD rather than the viewport
   * and covers about two hundred pixels of it. (The orphaned .flow-tagpick-scrim rules are the
   * remains of that attempt.)
   *
   * The dismissing press is swallowed ONLY when it lands on the board. There, letting it through
   * means putting the list away and dragging a card in one gesture, which is nobody's intent. On
   * the toolbar, the inspector or the tab bar it is allowed through, because a press on those is a
   * deliberate destination and making it take two clicks to reach would be its own annoyance.
   */
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      const target = e.target as Node
      if (root.current?.contains(target)) return
      setOpen(false)
      if ((target as Element).closest?.('.flow-stack')) {
        e.stopPropagation()
        e.preventDefault()
      }
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // The canvas binds Escape too (deselect, cancel a connection). One press, one thing undone.
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', down, true)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('mousedown', down, true)
      document.removeEventListener('keydown', esc, true)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const shown = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || (o.detail ?? '').toLowerCase().includes(q))
    : options

  return (
    /* Every handler here stops the canvas seeing it: mousedown would drag the card out from under
       the menu, and click would re-select it behind the menu. */
    <div
      className="flow-pick"
      ref={root}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className={`flow-pick-face${open ? ' open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={refId ? `${name}${detail ? `: ${detail}` : ''} · click to change` : `Link ${article} ${noun}`}
        onClick={() => { setQuery(''); setOpen((v) => !v); if (!open) onOpen() }}
      >
        <span className="flow-pick-name">{name || <em>Nothing picked yet</em>}</span>
        {/* A card with nothing behind it says so plainly. It is on the board, it is possibly wired
            to the campaign, and it is still sending the writer nothing — which is worth reading
            from the board rather than discovering in the copy. */}
        <span className="flow-pick-sub">{detail || (refId ? '' : 'Contributes nothing yet')}</span>
      </button>

      {open && (
        <div className="flow-pick-menu" role="listbox" aria-label={`Pick ${plural === noun ? noun : plural}`}>
          {options.length >= SEARCH_FROM && (
            <input
              className="flow-pick-search"
              autoFocus
              placeholder={`Search ${plural}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false) } }}
            />
          )}
          <div className="flow-pick-list">
            {!options.length && <div className="flow-pick-note">{emptyNote}</div>}
            {!!options.length && !shown.length && <div className="flow-pick-note">No {plural} match “{query.trim()}”.</div>}
            {shown.map((o) => (
              <button
                key={o.id}
                className={`flow-pick-opt${o.id === refId ? ' on' : ''}`}
                role="option"
                aria-selected={o.id === refId}
                onClick={() => { setOpen(false); onPick(o.id) }}
              >
                <span className="flow-pick-opt-txt">
                  <span className="flow-pick-opt-name">{o.label}</span>
                  {o.detail && <span className="flow-pick-opt-sub">{o.detail}</span>}
                </span>
                <span className="flow-pick-tick" style={{ color: tone }} aria-hidden="true">
                  {o.id === refId ? '✓' : ''}
                </span>
              </button>
            ))}
          </div>
          {/* CLEARING IS A CHOICE TOO, and the old <select> had it as the blank first row. Only
              offered once there is something to clear. */}
          {!!refId && (
            <button className="flow-pick-act" onClick={() => { setOpen(false); onPick('') }}>
              Unlink this {noun}
            </button>
          )}
          {canCreate && (
            <button className="flow-pick-act flow-pick-new" onClick={() => { setOpen(false); onCreate() }}>
              + New {noun}…
            </button>
          )}
        </div>
      )}
    </div>
  )
}
