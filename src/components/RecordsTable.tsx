import { useMemo, useState, type ReactNode } from 'react'
import { recordTint, type RecordColumn, type RecordField } from '../domain/records'
import { RecordDrawer } from './RecordDrawer'

/**
 * A generic spreadsheet-style Records table. Every text cell edits inline; Status is a
 * select tinted off its value; a `url` field renders an open-in-new affordance. Click a
 * header to sort. One component drives Companies, People, and any future record type —
 * pass its columns, rows, status options, and store actions.
 */
export function RecordsTable<T extends { id: string }>({
  title,
  icon,
  columns,
  fields,
  statuses,
  rows,
  noun,
  onAdd,
  onUpdate,
  onDelete,
}: {
  title: string
  icon: ReactNode
  columns: RecordColumn[]
  fields: RecordField[]
  statuses: string[]
  rows: T[]
  noun: [string, string]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<T>) => void
  onDelete: (id: string) => void
}) {
  const [sortKey, setSortKey] = useState<string>(columns[0]?.key ?? 'name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [openId, setOpenId] = useState<string | null>(null)
  const openRecord = openId ? rows.find((r) => r.id === openId) ?? null : null

  const val = (r: T, k: string) => ((r as Record<string, unknown>)[k] ?? '').toString()

  const sorted = useMemo(() => {
    const list = [...rows]
    list.sort((a, b) => {
      const av = val(a, sortKey).toLowerCase()
      const bv = val(b, sortKey).toLowerCase()
      if (av === bv) return 0
      const cmp = av < bv ? -1 : 1
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [rows, sortKey, sortDir])

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const totalWidth = columns.reduce((w, c) => w + c.width, 0) + 48
  const sortLabel = columns.find((c) => c.key === sortKey)?.label ?? title
  const set = (id: string, key: string, value: string) => onUpdate(id, { [key]: value } as Partial<T>)

  return (
    <div className="rec">
      <header className="rec-head">
        <div className="rec-title">
          <span className="rec-title-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              {icon}
            </svg>
          </span>
          {title}
        </div>
        <button className="rec-new" onClick={onAdd}>
          + New {noun[0]}
        </button>
      </header>

      <div className="rec-sub">
        <span className="rec-sub-count">
          {rows.length} {rows.length === 1 ? noun[0] : noun[1]}
        </span>
        <span className="rec-sub-sort">
          Sorted by {sortLabel} {sortDir === 'asc' ? '↑' : '↓'}
        </span>
      </div>

      <div className="rec-table-wrap">
        <table className="rec-table" style={{ minWidth: totalWidth }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={{ width: col.width }} onClick={() => toggleSort(col.key)}>
                  <span className="rec-th-label">{col.label}</span>
                  {sortKey === col.key && <span className="rec-th-sort">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
              <th className="rec-th-del" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const name = val(r, 'name')
              return (
                <tr key={r.id}>
                  {columns.map((col) => {
                    const v = val(r, col.key)
                    return (
                      <td key={col.key} className={`rec-td rec-td-${col.kind}`}>
                        {col.kind === 'name' ? (
                          <div className="rec-name">
                            <button
                              className="rec-ava rec-ava-btn"
                              style={{ background: recordTint(name) }}
                              title="Open details"
                              aria-label="Open details"
                              onClick={() => setOpenId(r.id)}
                            >
                              {(name.trim()[0] || '?').toUpperCase()}
                            </button>
                            <input className="rec-cell rec-cell-name" value={v} onChange={(e) => set(r.id, col.key, e.target.value)} />
                            <button className="rec-open" title="Open details" aria-label="Open details" onClick={() => setOpenId(r.id)}>
                              ⤢
                            </button>
                          </div>
                        ) : col.kind === 'status' ? (
                          <select
                            className="rec-status"
                            style={{ color: v ? recordTint(v) : undefined }}
                            value={v}
                            onChange={(e) => set(r.id, col.key, e.target.value)}
                          >
                            <option value="">—</option>
                            {statuses.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        ) : col.kind === 'url' ? (
                          <div className="rec-url">
                            <input className="rec-cell rec-cell-url" placeholder="—" value={v} onChange={(e) => set(r.id, col.key, e.target.value)} />
                            {v && (
                              <a className="rec-url-go" href={`https://${v.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" title="Open">
                                ↗
                              </a>
                            )}
                          </div>
                        ) : (
                          <input className="rec-cell" placeholder="—" value={v} onChange={(e) => set(r.id, col.key, e.target.value)} />
                        )}
                      </td>
                    )
                  })}
                  <td className="rec-td rec-td-del">
                    <button className="rec-del" title={`Delete ${noun[0]}`} aria-label={`Delete ${noun[0]}`} onClick={() => onDelete(r.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
            <tr className="rec-add-row" onClick={onAdd}>
              <td colSpan={columns.length + 1} className="rec-add-cell">
                + New {noun[0]}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {openRecord && (
        <RecordDrawer
          record={openRecord}
          fields={fields}
          statuses={statuses}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}
