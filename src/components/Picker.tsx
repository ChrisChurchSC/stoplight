import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/**
 * ONE DROPDOWN, for every field on a card.
 *
 * It replaces a native <select> carrying up to sixty-odd options, an em-dash row meaning "empty",
 * and a "Type something else…" escape sitting at the very bottom — so writing a value you had not
 * recorded meant scrolling past everything you had, and then the control changed into a different
 * control.
 *
 * What it does instead:
 *   - Type to filter. The search box only appears once the list is long enough to need it, so a
 *     six-item age band stays a plain list and a sixty-item job list becomes searchable.
 *   - Typing something no option matches offers it directly ("Use …"), so writing a new value and
 *     picking an existing one are the same gesture rather than two modes.
 *   - Clear is a button on the field, not a row in the list. An empty row that means "none" reads as
 *     an option called "—".
 *
 * Deliberately not a native select: the point of these lists is that they are long and drawn from
 * the user's own records, and a native select cannot be filtered.
 */

export interface PickerGroup {
  label: string
  options: string[]
  /** Renders the group as proposals rather than as things the brand already holds. */
  suggested?: boolean
}

interface Row {
  kind: 'option' | 'create'
  value: string
  /** Group heading to print above this row, when it starts a new group. */
  heading?: string
  suggested?: boolean
}

/** Options flattened to rows, filtered, with headings attached to the row that starts each group. */
function buildRows(groups: PickerGroup[], query: string, exclude: string[], allowCreate = true): Row[] {
  const q = query.trim().toLowerCase()
  const seen = new Set(exclude.map((v) => v.toLowerCase()))
  const rows: Row[] = []
  for (const g of groups) {
    let first = true
    for (const o of g.options) {
      const v = o.trim()
      const k = v.toLowerCase()
      if (!v || seen.has(k)) continue
      if (q && !k.includes(q)) continue
      seen.add(k)
      rows.push({ kind: 'option', value: v, heading: first ? g.label : undefined, suggested: g.suggested })
      first = false
    }
  }
  // Offer what was typed when nothing matches it exactly. First, because if you have typed a whole
  // value that is not in the list, using it is almost certainly what you meant.
  const typed = query.trim()
  if (allowCreate && typed && !rows.some((r) => r.value.toLowerCase() === typed.toLowerCase())) {
    rows.unshift({ kind: 'create', value: typed })
  }
  return rows
}

/**
 * Close on any interaction outside, and on any OTHER picker opening.
 *
 * The outside-click handler alone is not enough: a keyboard open, or a click synthesised without a
 * mousedown, leaves two lists on screen at once — which is not just untidy, it is ambiguous about
 * which field a keypress belongs to.
 */
const openPickers = new Set<() => void>()

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open) return
    const self = () => closeRef.current()
    for (const other of openPickers) other()
    openPickers.add(self)
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeRef.current()
    }
    // Capture, so a click that also drags a canvas card still closes this first.
    document.addEventListener('mousedown', onDown, true)
    return () => {
      openPickers.delete(self)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [open])
  return ref
}

/** How many options before the list is worth filtering. Below this, a search box is just a step. */
const SEARCH_AT = 8

export function Picker({
  value,
  groups,
  placeholder,
  exclude = [],
  keepOpen = false,
  allowCreate = true,
  maxLength,
  onSuggest,
  onPick,
}: {
  /** The current value. Empty string shows the placeholder. */
  value: string
  groups: PickerGroup[]
  placeholder: string
  /** Values to leave out of the list (already-chosen chips, on a multi field). */
  exclude?: string[]
  /** Stay open after picking, for a field that takes several values. */
  keepOpen?: boolean
  /**
   * Can the user write a value that is not on the list?
   *
   * True for anything backed by a starter library, where the list is a starting point. FALSE for a
   * closed enum (age band, funnel stage, status), where a typed value is not a shortcut, it is a
   * value nothing downstream knows how to read.
   */
  allowCreate?: boolean
  maxLength?: number
  /**
   * Ask for candidates tailored to this brand. Optional: a field with nothing sensible to generate
   * simply does not pass it, and no button appears.
   *
   * What comes back is held in local state and shown under its own heading. It is NEVER written
   * anywhere: close the list and it is gone. Picking one is what asserts it, exactly as typing it
   * would be. That is the whole reason this is safe to have at all, given the rest of the app
   * guarantees the copy writer only sees strings the user chose.
   */
  onSuggest?: () => Promise<string[]>
  onPick: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [above, setAbove] = useState(false)
  const [suggested, setSuggested] = useState<string[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [suggestErr, setSuggestErr] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  // Suggestions die with the popup. They are proposals, and an unclosed proposal is not a value.
  const close = () => { setOpen(false); setQuery(''); setSuggested([]); setSuggestErr(null) }
  const wrapRef = useDismiss(open, close)

  const withSuggested = useMemo(
    () => (suggested.length ? [...groups, { label: 'Suggested for this brand', options: suggested, suggested: true }] : groups),
    [groups, suggested],
  )
  const total = useMemo(() => withSuggested.reduce((n, g) => n + g.options.length, 0), [withSuggested])
  const rows = useMemo(() => buildRows(withSuggested, query, exclude, allowCreate), [withSuggested, query, exclude, allowCreate])
  /**
   * The search box is also the ONLY way to write a value that is not listed, so a field that accepts
   * free values must always have one. Without this, a picker whose library happens to be empty had
   * no options AND no input: a control you could open and not use.
   */
  const searchable = allowCreate || total >= SEARCH_AT

  // Clamp the highlight whenever filtering changes the list under it.
  useEffect(() => { setActive(0) }, [query, open])

  // Open upward when there is more room above — a card near the bottom of the panel would otherwise
  // drop its list off-screen, which on a long list means you cannot see what you are choosing.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setAbove(window.innerHeight - r.bottom < 240 && r.top > window.innerHeight - r.bottom)
  }, [open])

  const choose = (v: string) => {
    onPick(v)
    if (keepOpen) setQuery('')
    else close()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); btnRef.current?.focus(); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!rows.length) return
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % rows.length : (i - 1 + rows.length) % rows.length))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const row = rows[active]
      if (row) choose(row.value)
      else if (query.trim()) choose(query.trim())
    }
  }

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  return (
    <div className="pk" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`pk-field${value ? '' : ' empty'}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="pk-value">{value || placeholder}</span>
        <svg className="pk-caret" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {/* Clear sits on the field, not in the list: a row that means "none" reads as an option. */}
      {value && !keepOpen && (
        <button type="button" className="pk-clear" title="Clear" onMouseDown={(e) => e.stopPropagation()} onClick={() => onPick('')}>×</button>
      )}
      {open && (
        <div className={`pk-pop${above ? ' above' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
          {searchable && (
            <input
              className="pk-search"
              autoFocus
              value={query}
              maxLength={maxLength}
              placeholder={allowCreate ? 'Type to filter, or write your own' : 'Type to filter'}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
            />
          )}
          <div className="pk-list" role="listbox" ref={listRef} onKeyDown={onKey} tabIndex={searchable ? -1 : 0}>
            {/* THE FIRST ROW, not a footer button. It is a thing you pick, exactly like every other
                row here, so it should sit where your eye already is and look like the rest of them.
                Marked with the same dot the results carry, so the action and its output read as one
                idea rather than two unrelated bits of chrome. */}
            {onSuggest && (
              <>
                <button
                  type="button"
                  className="pk-opt pk-ask"
                  disabled={suggesting}
                  onClick={async () => {
                    setSuggesting(true)
                    setSuggestErr(null)
                    try {
                      setSuggested(await onSuggest())
                    } catch (e) {
                      setSuggestErr((e as Error)?.message === 'NO_KEY' ? 'No model key set.' : 'Could not reach the model.')
                    } finally {
                      setSuggesting(false)
                    }
                  }}
                >
                  {suggesting ? 'Thinking…' : suggested.length ? 'Suggest more for this brand' : 'Suggest for this brand'}
                </button>
                {suggestErr && <div className="pk-ask-err">{suggestErr}</div>}
                {!!suggested.length && !suggestErr && (
                  <div className="pk-ask-note">Nothing is saved until you pick one.</div>
                )}
                <div className="pk-ask-rule" />
              </>
            )}
            {rows.length === 0 && (
              <div className="pk-empty">{allowCreate ? 'Nothing saved yet. Type to add the first one.' : 'No matches'}</div>
            )}
            {rows.map((r, i) => (
              <div key={`${r.kind}:${r.value}`}>
                {r.heading && <div className="pk-head">{r.heading}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={r.value === value}
                  data-active={i === active}
                  className={`pk-opt${r.kind === 'create' ? ' create' : ''}${r.suggested ? ' suggested' : ''}${r.value === value ? ' on' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(r.value)}
                >
                  {r.kind === 'create' ? <>Use “{r.value}”</> : r.value}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
