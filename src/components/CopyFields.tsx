import { useEffect, useRef, useState } from 'react'
import type { MessagingField } from '../domain/messaging'

/**
 * THE COPY THAT SHIPS, EDITABLE.
 *
 * Extracted from CopyReview so the canvas inspector and the review page are the same editor rather
 * than two that drift. Before this, opening a post on the canvas showed its copy as read-only text at
 * the very bottom of the panel, with empty components filtered out entirely, so a post with no copy
 * showed nothing at all and changing one word meant leaving the canvas.
 *
 * EVERY COMPONENT IN THE SCHEMA RENDERS, including the empty ones. An empty box labelled "Headline"
 * is what tells you this format has a headline and you have not written it; hiding it makes the
 * absence invisible, which is the state a person most needs to see.
 *
 * The counter turns over at the field's hard limit rather than blocking input: generation clamps at
 * write-back (clampToLimit), but a person typing is allowed to overshoot and then cut, and refusing
 * the keystroke is how you lose the sentence somebody was halfway through.
 *
 * TYPING IS LOCAL, SAVING IS DEBOUNCED. The obvious wiring, onChange straight to the store, is very
 * expensive here: updateRow calls refresh(), and refresh() calls sheet.list(), which on the Supabase
 * adapter is a paginated fetch of EVERY asset row in the workspace. So the naive version costs one
 * row write plus one full workspace read per character, and re-renders every subscriber twice while
 * it does it. The box holds its own value and commits half a second after you stop, and on blur.
 */

export interface CopyFieldsProps {
  fields: MessagingField[]
  values: Record<string, string>
  setField: (key: string, value: string) => void
  /** Optional per-field extras, used by the review page and absent on the canvas. */
  renderExtras?: (field: MessagingField, value: string) => React.ReactNode
  /** Marks a field as flagged (drift), which the review page uses and the inspector does not. */
  flagOf?: (key: string) => { issue?: string; suggestion?: string } | undefined
  /**
   * The canvas keeps single-letter keyboard shortcuts alive while a card is selected, so typing "b"
   * into a copy box would otherwise open the deliverable picker. Set on the inspector, not on the
   * review page, which has no shortcuts to stop.
   */
  stopKeys?: boolean
}

/** How long after the last keystroke the value is committed. Long enough to cover normal typing. */
const SAVE_MS = 500

export function CopyFields({ fields, values, setField, renderExtras, flagOf, stopKeys }: CopyFieldsProps) {
  /**
   * What is in the boxes right now, which is ahead of the store between keystrokes.
   *
   * Keyed by field. Cleared for a field once the store catches up, so an external change (a
   * generation landing, another surface editing the same row) still shows through rather than being
   * masked forever by a stale local value.
   */
  const [local, setLocal] = useState<Record<string, string>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Flush anything still pending when this unmounts, or a half-typed sentence is lost by clicking away.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const t of Object.values(pending)) clearTimeout(t)
    }
  }, [])

  const commit = (key: string, value: string) => {
    clearTimeout(timers.current[key])
    delete timers.current[key]
    setField(key, value)
  }
  const onType = (key: string, value: string) => {
    setLocal((l) => ({ ...l, [key]: value }))
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => commit(key, value), SAVE_MS)
  }

  return (
    <>
      {fields.map((fl) => {
        const stored = values[fl.key] ?? ''
        const val = local[fl.key] ?? stored
        const flag = flagOf?.(fl.key)
        const over = fl.hardLimit ? val.length > fl.hardLimit : false
        return (
          <label className={`copy-field${flag ? ' flagged' : ''}`} key={fl.key}>
            <span className="copy-label">
              {fl.label}
              <span className={`copy-count${over ? ' over' : ''}`}>
                {val.length}
                {fl.hardLimit ? `/${fl.hardLimit}` : ''}
              </span>
            </span>
            {/* SIZED BY WHAT IT HOLDS, in two steps rather than one. `tall` covered both a 200
                character pinned comment and a 5,000 character description, so one height was either
                too short for the long one or mostly empty under the short one. A field that can take
                a thousand characters gets the taller box; the heights themselves are in the CSS. */}
            <textarea
              className={fl.multiline ? (fl.hardLimit && fl.hardLimit >= 1000 ? 'tall xl' : 'tall') : ''}
              value={val}
              placeholder={`${fl.label}…`}
              onChange={(e) => onType(fl.key, e.target.value)}
              // Commit immediately on blur: leaving the box is the clearest "I am done" there is,
              // and waiting out the debounce after a click away is how an edit goes missing.
              onBlur={(e) => {
                if (e.target.value !== stored) commit(fl.key, e.target.value)
                setLocal((l) => { const { [fl.key]: _drop, ...rest } = l; return rest })
              }}
              onKeyDown={stopKeys ? (e) => e.stopPropagation() : undefined}
              onMouseDown={stopKeys ? (e) => e.stopPropagation() : undefined}
            />
            {flag && (
              <div className="msg-flag">
                <span className="flag-tag">drift</span>
                <div>
                  <div className="flag-reason">{flag.issue}</div>
                  {flag.suggestion && <div className="flag-suggest">→ {flag.suggestion}</div>}
                </div>
              </div>
            )}
            {renderExtras?.(fl, val)}
          </label>
        )
      })}
    </>
  )
}
