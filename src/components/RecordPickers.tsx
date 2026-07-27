import { useMemo, useState } from 'react'

/**
 * PICK-FIRST CONTROLS for the fields on a card.
 *
 * Typing the same pain slightly differently on four audiences is how a brand ends up with four
 * vocabularies and no way to see that they are the same thing. So these are dropdowns first: you
 * choose from what exists, and writing something new is deliberate rather than the default.
 *
 * WHERE THE OPTIONS COME FROM, in order:
 *   1. what this brand has already recorded for this field on its other records — always first,
 *      because it is the only source that is certainly true of this brand;
 *   2. the shared library (PAIN_LIBRARY, GOAL_LIBRARY, BUYING_TRIGGERS …) as a starting vocabulary;
 *   3. whatever the user types, which is added to (1) the moment it is saved and so becomes a
 *      suggestion everywhere else.
 *
 * Nothing here is generated. A suggestion is either a string the user has written or an entry in a
 * hand-written library, never a guess, because a guess in these fields reaches the copy writer as
 * though the user had asserted it.
 */

/** One group of options, labelled so the picker can say where a suggestion came from. */
export interface OptionGroup {
  label: string
  options: string[]
}

const SENTINEL = '__type__'

/** Everything on offer, deduped across groups, keeping the first (most brand-specific) home. */
function dedupe(groups: OptionGroup[], exclude: string[] = []): OptionGroup[] {
  const seen = new Set(exclude.map((v) => v.toLowerCase()))
  const out: OptionGroup[] = []
  for (const g of groups) {
    const options: string[] = []
    for (const o of g.options) {
      const k = o.trim().toLowerCase()
      if (!k || seen.has(k)) continue
      seen.add(k)
      options.push(o.trim())
    }
    if (options.length) out.push({ label: g.label, options })
  }
  return out
}

/**
 * ONE VALUE, chosen from a list or typed.
 *
 * The typed escape is a real option in the list rather than a separate button: a control that can be
 * either a select or an input has to say so in the one place the user is already looking.
 */
export function RecordCombo({
  value,
  groups,
  placeholder,
  maxLength,
  onCommit,
}: {
  value: string
  groups: OptionGroup[]
  placeholder: string
  /** Cap on a typed value, so a combo can stand in for a capped textarea without losing the cap. */
  maxLength?: number
  onCommit: (v: string) => void
}) {
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const shown = useMemo(() => dedupe(groups), [groups])
  const known = shown.some((g) => g.options.some((o) => o.toLowerCase() === value.toLowerCase()))

  if (typing) {
    return (
      <input
        className="flow-recform-input"
        autoFocus
        maxLength={maxLength}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onCommit(draft.trim()); setTyping(false) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onCommit(draft.trim()); setTyping(false) }
          if (e.key === 'Escape') setTyping(false)
        }}
      />
    )
  }
  return (
    <select
      className="flow-recform-select as-written"
      value={value}
      onChange={(e) => {
        if (e.target.value === SENTINEL) { setDraft(value); setTyping(true); return }
        onCommit(e.target.value)
      }}
    >
      <option value="">—</option>
      {/* A value the user typed before, or one written by an import, still selects rather than
          reading as blank and being lost on the next change. */}
      {value && !known && <option value={value}>{value}</option>}
      {shown.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (<option key={o} value={o}>{o}</option>))}
        </optgroup>
      ))}
      <option value={SENTINEL}>Type something else…</option>
    </select>
  )
}

/**
 * SEVERAL VALUES, as chips plus an add-picker.
 *
 * Chips rather than a multi-select box because these lists are read far more often than they are
 * edited — on the card, in the inspector, by whoever picks the campaign up next — and a native
 * multi-select shows its selection only while it has focus.
 */
export function RecordMulti({
  values,
  groups,
  addLabel,
  onCommit,
}: {
  values: string[]
  groups: OptionGroup[]
  addLabel: string
  onCommit: (v: string[]) => void
}) {
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  // Anything already chosen drops out of the picker: offering it again reads as a second slot.
  const shown = useMemo(() => dedupe(groups, values), [groups, values])
  const add = (v: string) => { const t = v.trim(); if (t && !values.some((x) => x.toLowerCase() === t.toLowerCase())) onCommit([...values, t]) }

  return (
    <div className="flow-chips">
      {values.map((v) => (
        <span key={v} className="flow-chip">
          {v}
          <button
            type="button"
            className="flow-chip-x"
            title="Remove"
            onClick={() => onCommit(values.filter((x) => x !== v))}
          >
            ×
          </button>
        </span>
      ))}
      {typing ? (
        <input
          className="flow-chip-input"
          autoFocus
          value={draft}
          placeholder={addLabel}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { add(draft); setDraft(''); setTyping(false) }}
          onKeyDown={(e) => {
            // Enter keeps the field open so a list can be entered in one go.
            if (e.key === 'Enter') { add(draft); setDraft('') }
            if (e.key === 'Escape') { setDraft(''); setTyping(false) }
          }}
        />
      ) : (
        <select
          className="flow-chip-add as-written"
          value=""
          onChange={(e) => {
            if (e.target.value === SENTINEL) { setTyping(true); return }
            add(e.target.value)
          }}
        >
          <option value="">{addLabel}</option>
          {shown.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (<option key={o} value={o}>{o}</option>))}
            </optgroup>
          ))}
          <option value={SENTINEL}>Type something else…</option>
        </select>
      )}
    </div>
  )
}
