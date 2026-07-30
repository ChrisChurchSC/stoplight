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

export function CopyFields({ fields, values, setField, renderExtras, flagOf, stopKeys }: CopyFieldsProps) {
  return (
    <>
      {fields.map((fl) => {
        const val = values[fl.key] ?? ''
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
            <textarea
              className={fl.multiline ? 'tall' : ''}
              value={val}
              placeholder={`${fl.label}…`}
              onChange={(e) => setField(fl.key, e.target.value)}
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
