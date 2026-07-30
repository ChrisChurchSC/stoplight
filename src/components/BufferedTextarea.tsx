import { useEffect, useRef, useState } from 'react'

/**
 * A TEXT BOX THAT TYPES LOCALLY AND SAVES LATE.
 *
 * The obvious wiring, onChange straight to a store action, is very expensive on the long-form fields
 * this wraps. updateRow calls refresh(), and refresh() calls sheet.list(), which on the Supabase
 * adapter is a paginated fetch of EVERY asset row in the workspace, so one character costs a row
 * write plus a full workspace read, and re-renders every subscriber twice while it does it. The
 * brand-guide fields go through persistState, which is an un-debounced Supabase upsert per
 * character. This box holds its own value and commits half a second after you stop, and on blur.
 *
 * It is CopyFields' behaviour lifted out for the boxes that are not messaging components: same
 * 500ms, same blur flush, same rule that the local value is dropped once the store catches up. The
 * few lines they have in common are duplicated on purpose for now, because CopyFields is under
 * review elsewhere and converging the two is a later decision.
 *
 * HANDING CONTROL BACK is what the drop below is for. While a local value is held, this box is the
 * only writer anything can see, so an external change (a generation landing, another surface editing
 * the same record) would be masked by it. Dropping it the moment the store agrees, and again on
 * blur, means an idle box always shows what is stored.
 */

/** How long after the last keystroke the value is committed. Long enough to cover normal typing. */
const SAVE_MS = 500

interface Buffered {
  /** The stored value. Shown whenever there is nothing newer in the box. */
  value: string
  /** Called with the text to save, once per pause rather than once per character. */
  onCommit: (value: string) => void
}

/**
 * Renders as a <textarea> by default and as an <input> on `as="input"`, since the same debounce is
 * wanted on single-line free text (an asset name, a spreadsheet cell) as on a body of copy.
 */
export type BufferedTextareaProps =
  | (Buffered & { as?: 'textarea' } & Omit<React.ComponentPropsWithoutRef<'textarea'>, 'value' | 'onChange'>)
  | (Buffered & { as: 'input' } & Omit<React.ComponentPropsWithoutRef<'input'>, 'value' | 'onChange'>)

export function BufferedTextarea(props: BufferedTextareaProps) {
  const { value, onCommit } = props
  /** What is in the box right now, which is ahead of the store between keystrokes. Null means idle. */
  const [local, setLocal] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (local !== null && local === value) setLocal(null)
  }, [local, value])

  // A pending timer that outlives the box has nowhere useful to write, so drop it. Blur runs first
  // in every path that closes one of these (a click on a scrim, a button, another field), which is
  // what actually saves the text.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const commit = (next: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    onCommit(next)
  }
  const onType = (next: string) => {
    setLocal(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => commit(next), SAVE_MS)
  }

  /**
   * Leaving the box ends the edit, whether or not the text ended up different.
   *
   * Clearing the timer has to happen unconditionally, and that is the whole point of this function.
   * The obvious version only commits when the value changed, and commit() is the only thing that
   * clears the pending timer, so typing a character and deleting it again leaves the box matching
   * the store, skips the commit, and leaves a timer armed on a field nobody is in any more. Half a
   * second later it writes the pre-edit text. If a generation landed in that window, and "type a
   * word, undo it, hit Draft" is a normal thing to do, the draft is silently reverted to what was
   * there before. Clear first, then decide whether there is anything worth saving.
   */
  const flush = (next: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (next !== value) onCommit(next)
    setLocal(null)
  }
  const shown = local ?? value

  if (props.as === 'input') {
    const { as: _as, value: _value, onCommit: _onCommit, onBlur, ...rest } = props
    return (
      <input
        {...rest}
        value={shown}
        onChange={(e) => onType(e.target.value)}
        // Commit immediately on blur: leaving the box is the clearest "I am done" there is, and
        // waiting out the debounce after a click away is how an edit goes missing.
        onBlur={(e) => {
          flush(e.target.value)
          onBlur?.(e)
        }}
      />
    )
  }

  const { as: _as, value: _value, onCommit: _onCommit, onBlur, ...rest } = props
  return (
    <textarea
      {...rest}
      value={shown}
      onChange={(e) => onType(e.target.value)}
      onBlur={(e) => {
        flush(e.target.value)
        onBlur?.(e)
      }}
    />
  )
}
