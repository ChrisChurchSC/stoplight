import { useState } from 'react'

/**
 * A tag editor — type + Enter/comma to add, × to remove, Backspace on an empty field
 * to pop the last. Shared by the brand Voice and Personalization guides.
 */
export function ChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, '').trim()
    if (!v || values.includes(v)) return
    onChange([...values, v])
  }
  return (
    <div className="voice-chips">
      {values.map((v) => (
        <span className="voice-chip" key={v}>
          {v}
          <button
            type="button"
            className="voice-chip-x"
            title={`Remove ${v}`}
            onClick={() => onChange(values.filter((x) => x !== v))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="voice-chip-input"
        value={draft}
        placeholder={values.length ? '' : placeholder}
        onChange={(e) => {
          const val = e.target.value
          if (val.endsWith(',')) {
            add(val)
            setDraft('')
          } else {
            setDraft(val)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(draft)
            setDraft('')
          } else if (e.key === 'Backspace' && !draft && values.length) {
            onChange(values.slice(0, -1))
          }
        }}
        onBlur={() => {
          if (draft.trim()) {
            add(draft)
            setDraft('')
          }
        }}
      />
    </div>
  )
}
