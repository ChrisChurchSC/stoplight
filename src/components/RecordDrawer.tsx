import { Fragment, type ReactNode } from 'react'
import { recordTint, type RecordField } from '../domain/records'
import { BufferedInput, BufferedTextarea } from './BufferedInput'

/** Split a colors field value ("#FAF, #3EC") into individual swatches. */
const parseColors = (v: string): string[] => v.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)

/**
 * A record's detail panel — a right-side sheet showing every attribute of one record
 * (a superset of the table columns), each edited inline. Same store actions as the
 * table, so edits here and in the grid stay in sync. Generic over the record type.
 */
export function RecordDrawer<T extends { id: string }>({
  record,
  fields,
  statuses,
  fieldOptions,
  onUpdate,
  onDelete,
  onClose,
  related,
}: {
  record: T
  fields: RecordField[]
  statuses: string[]
  /** Options for `ref`-kind fields, keyed by field key (e.g. the brand's segment names). */
  fieldOptions?: Record<string, string[]>
  onUpdate: (id: string, patch: Partial<T>) => void
  onDelete: (id: string) => void
  onClose: () => void
  /** Related records surfaced at the bottom (e.g. the people at a company). */
  related?: ReactNode
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
          <BufferedInput className="rd-name" value={name} onCommit={(v) => set('name', v)} placeholder="Name" />
          <button className="rd-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="rd-fields">
          {fields
            .filter((f) => f.key !== 'name')
            .map((f, i, arr) => {
              const v = val(f.key)
              const showHeader = !!f.group && f.group !== (i > 0 ? arr[i - 1].group : undefined)
              const block = f.kind === 'multiline' || f.kind === 'colors'
              return (
                <Fragment key={f.key}>
                  {showHeader && <div className="rd-group">{f.group}</div>}
                <div className={`rd-field${block ? ' rd-field-block' : ''}`}>
                  <label className="rd-label">{f.label}</label>
                  {f.kind === 'multiline' ? (
                    <BufferedTextarea className="rd-input rd-textarea" value={v} onCommit={(nv) => set(f.key, nv)} rows={3} placeholder="Empty" />
                  ) : f.kind === 'colors' ? (
                    <div className="rd-colors">
                      {parseColors(v).length > 0 && (
                        <div className="rd-swatches">
                          {parseColors(v).map((c, j) => (
                            <span key={j} className="rd-swatch" style={{ background: c }} title={c} />
                          ))}
                        </div>
                      )}
                      <BufferedInput className="rd-input" value={v} onCommit={(nv) => set(f.key, nv)} placeholder="#FAF6F0, #3ECBA0" />
                    </div>
                  ) : f.kind === 'status' ? (
                    <select className="rd-input rd-select" style={{ color: v ? recordTint(v) : undefined }} value={v} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">—</option>
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === 'ref' ? (
                    <select className="rd-input rd-select" style={{ color: v ? recordTint(v) : undefined }} value={v} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">—</option>
                      {(fieldOptions?.[f.key] ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                      {v && !(fieldOptions?.[f.key] ?? []).includes(v) && <option value={v}>{v}</option>}
                    </select>
                  ) : f.kind === 'url' ? (
                    <div className="rd-url">
                      <BufferedInput className="rd-input rd-cell-url" value={v} onCommit={(nv) => set(f.key, nv)} placeholder="Empty" />
                      {v && (
                        <a className="rd-url-go" href={`https://${v.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" title="Open">
                          ↗
                        </a>
                      )}
                    </div>
                  ) : (
                    <BufferedInput className="rd-input" value={v} onCommit={(nv) => set(f.key, nv)} placeholder="Empty" />
                  )}
                </div>
                </Fragment>
              )
            })}
          {related}
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
