import { useState } from 'react'
import { Picker, type PickerGroup } from './Picker'
import { formatZip, isZip, stateForZip, zipOf } from '../domain/zip'

/**
 * PICK-FIRST CONTROLS for the fields on a card.
 *
 * Typing the same pain slightly differently on four audiences is how a brand ends up with four
 * vocabularies and no way to see that they are the same thing. So these are dropdowns first: you
 * choose from what exists, and writing something new happens in the same box rather than through a
 * separate escape hatch at the bottom of the list.
 *
 * WHERE THE OPTIONS COME FROM, in order:
 *   1. what this brand has already recorded for this field on its other records — always first,
 *      because it is the only source that is certainly true of this brand;
 *   2. the shared starter library (PAIN_LIBRARY, OBJECTION_LIBRARY, GOAL_LIBRARY …);
 *   3. whatever the user types, which joins (1) the moment it is saved and so becomes a suggestion
 *      everywhere else.
 *
 * Nothing here is generated. A suggestion is either a string the user wrote or a hand-written
 * library entry, never a guess, because a guess in these fields reaches the copy writer as though
 * the user had asserted it.
 *
 * All of these share one dropdown (see Picker) so a card has a single interaction to learn.
 */

export type OptionGroup = PickerGroup

/** ONE VALUE, chosen from the list or typed into it. */
export function RecordCombo({
  value,
  groups,
  placeholder,
  maxLength,
  allowCreate,
  onCommit,
}: {
  value: string
  groups: OptionGroup[]
  placeholder: string
  maxLength?: number
  /** False for a closed enum, where a typed value is one nothing downstream can read. */
  allowCreate?: boolean
  onCommit: (v: string) => void
}) {
  return <Picker value={value} groups={groups} placeholder={placeholder} maxLength={maxLength} allowCreate={allowCreate} onPick={onCommit} />
}

/**
 * SEVERAL VALUES, as chips plus one picker.
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
  const add = (v: string) => {
    const t = v.trim()
    if (t && !values.some((x) => x.toLowerCase() === t.toLowerCase())) onCommit([...values, t])
  }
  return (
    <div className="flow-chips">
      {values.map((v) => (
        <span key={v} className="flow-chip">
          {v}
          <button type="button" className="flow-chip-x" title="Remove" onClick={() => onCommit(values.filter((x) => x !== v))}>×</button>
        </span>
      ))}
      {/* Stays open after each pick: adding three interests should be three clicks, not three
          open-pick-reopen cycles. Already-chosen values drop out of the list rather than sitting
          there looking like a second slot. */}
      <Picker value="" groups={groups} placeholder={addLabel} exclude={values} keepOpen onPick={add} />
    </div>
  )
}

/**
 * A ZIP, typed, with the place it resolves to shown back.
 *
 * The confirmation line is the whole point: five digits look identical whether they are right or a
 * typo, so the field has to say what it understood. "New Jersey" under the box is checkable at a
 * glance; "07740" alone is not.
 *
 * An unresolvable but well-formed ZIP still commits — plenty of prefixes are unallocated, and
 * refusing one the user knows is real would be the field claiming an authority it does not have.
 */
export function ZipField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? zipOf(value)
  const state = stateForZip(shown)
  const complete = isZip(shown)
  return (
    <>
      <input
        className="flow-recform-input"
        inputMode="numeric"
        maxLength={5}
        value={shown}
        placeholder="ZIP code"
        onChange={(e) => {
          // Digits only, so a pasted "NJ 07740" narrows to the part this field can use.
          const next = e.target.value.replace(/\D/g, '').slice(0, 5)
          setDraft(next)
          if (isZip(next)) onCommit(formatZip(next))
          else if (next === '') onCommit('')
        }}
        onBlur={() => setDraft(null)}
      />
      {shown && (
        <span className={`flow-zip-echo${complete && !state ? ' unknown' : ''}`}>
          {complete
            ? state ?? 'Not a ZIP we recognise. Saved anyway.'
            : `${5 - shown.length} more digit${shown.length === 4 ? '' : 's'}`}
        </span>
      )}
    </>
  )
}
