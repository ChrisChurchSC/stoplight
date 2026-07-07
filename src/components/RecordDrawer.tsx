import { recordTint, type RecordField } from '../domain/records'

/**
 * A record's detail panel — a right-side sheet showing every attribute of one record
 * (a superset of the table columns), each edited inline. Same store actions as the
 * table, so edits here and in the grid stay in sync. Generic over the record type.
 */
export function RecordDrawer<T extends { id: string }>({
  record,
  fields,
  statuses,
  onUpdate,
  onDelete,
  onClose,
}: {
  record: T
  fields: RecordField[]
  statuses: string[]
  onUpdate: (id: string, patch: Partial<T>) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const val = (k: string) => ((record as Record<string, unknown>)[k] ?? '').toString()
  const set = (k: string, v: string) => onUpdate(record.id, { [k]: v } as Partial<T>)
  const name = val('name')

  return (
    <>
      <div className="rd-scrim" onClick={onClose} />
      <aside className="rd" role="dialog" aria-label={`${name} details`}>
        <header className="rd-head">
          <span className="rd-ava" style={{ background: recordTint(name) }}>
            {(name.trim()[0] || '?').toUpperCase()}
          </span>
          <input className="rd-name" value={name} onChange={(e) => set('name', e.target.value)} placeholder="Name" />
          <button className="rd-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="rd-fields">
          {fields
            .filter((f) => f.key !== 'name')
            .map((f) => {
              const v = val(f.key)
              return (
                <div className={`rd-field${f.kind === 'multiline' ? ' rd-field-block' : ''}`} key={f.key}>
                  <label className="rd-label">{f.label}</label>
                  {f.kind === 'multiline' ? (
                    <textarea className="rd-input rd-textarea" value={v} onChange={(e) => set(f.key, e.target.value)} rows={3} placeholder="Empty" />
                  ) : f.kind === 'status' ? (
                    <select className="rd-input rd-select" style={{ color: v ? recordTint(v) : undefined }} value={v} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">—</option>
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === 'url' ? (
                    <div className="rd-url">
                      <input className="rd-input rd-cell-url" value={v} onChange={(e) => set(f.key, e.target.value)} placeholder="Empty" />
                      {v && (
                        <a className="rd-url-go" href={`https://${v.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" title="Open">
                          ↗
                        </a>
                      )}
                    </div>
                  ) : (
                    <input className="rd-input" value={v} onChange={(e) => set(f.key, e.target.value)} placeholder="Empty" />
                  )}
                </div>
              )
            })}
        </div>

        <footer className="rd-foot">
          <button
            className="rd-del"
            onClick={() => {
              onDelete(record.id)
              onClose()
            }}
          >
            Delete
          </button>
        </footer>
      </aside>
    </>
  )
}
