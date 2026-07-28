import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ClipboardEvent as ReactClipboardEvent } from 'react'

/**
 * A text input / textarea that buffers keystrokes locally and only commits on blur.
 * Record fields round-trip through a parse/format pair (arrays join to text, colors
 * split to swatches); committing per keystroke would strip separators as you type them
 * and — for the name field — fire a rename on every character. Buffering fixes both:
 * the raw text stays intact while focused, and the store updates once, on blur.
 */
function useBuffer(value: string, onCommit: (v: string) => void) {
  const [buf, setBuf] = useState(value)
  const focused = useRef(false)
  // Sync external changes in only while the field isn't being edited.
  useEffect(() => {
    if (!focused.current) setBuf(value)
  }, [value])
  return {
    value: buf,
    onFocus: () => { focused.current = true },
    onChange: (v: string) => setBuf(v),
    onBlur: () => {
      focused.current = false
      if (buf !== value) onCommit(buf)
    },
  }
}

export function BufferedInput({ value, onCommit, className, placeholder, style, onKeyDown, onPaste, cellR, cellC }: {
  value: string
  onCommit: (v: string) => void
  className?: string
  placeholder?: string
  style?: CSSProperties
  /** Spreadsheet keyboard nav (Tab/Enter/Arrow) handled by the table, plus TSV paste. */
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void
  onPaste?: (e: ReactClipboardEvent<HTMLInputElement>) => void
  /** Cell coordinates so the table can move focus between cells. */
  cellR?: number
  cellC?: number
}) {
  const b = useBuffer(value, onCommit)
  return (
    <input
      className={className}
      style={style}
      placeholder={placeholder}
      value={b.value}
      data-r={cellR}
      data-c={cellC}
      onFocus={b.onFocus}
      onChange={(e) => b.onChange(e.target.value)}
      onBlur={b.onBlur}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
  )
}

export function BufferedTextarea({ value, onCommit, className, placeholder, rows }: {
  value: string
  onCommit: (v: string) => void
  className?: string
  placeholder?: string
  rows?: number
}) {
  const b = useBuffer(value, onCommit)
  return (
    <textarea
      className={className}
      placeholder={placeholder}
      rows={rows}
      value={b.value}
      onFocus={b.onFocus}
      onChange={(e) => b.onChange(e.target.value)}
      onBlur={b.onBlur}
    />
  )
}
