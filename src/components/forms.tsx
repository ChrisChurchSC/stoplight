/** Small, reusable selector controls shared across the intake wizards. */

/** Single-select pill group (business model, gender, seniority). */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: readonly string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`seg-btn${value === o ? ' on' : ''}`}
          onClick={() => onChange(value === o ? '' : o)}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/** Multi-select chip group (pains, job functions, age ranges, goals, …). */
export function ChipMulti({
  options,
  value,
  onChange,
}: {
  options: readonly string[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  const toggle = (o: string) =>
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])
  return (
    <div className="chip-multi">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`chip-opt${value.includes(o) ? ' on' : ''}`}
          onClick={() => toggle(o)}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/** Native single-select dropdown styled like the wizard inputs. */
export function Dropdown({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: readonly string[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <select className="wiz-input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? 'Select…'}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}
