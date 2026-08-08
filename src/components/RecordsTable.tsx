import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent, type ClipboardEvent as ReactClipboardEvent } from 'react'
import { optionsAreSentences, recordTint, visibleForSkill, type RecordColumn, type RecordField } from '../domain/records'
import { loadRecordGrouping, saveRecordGrouping } from '../domain/recordGrouping'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordDrawer } from './RecordDrawer'
import { RecordsChat } from './RecordsChat'
import { InfoTip } from './InfoTip'
import { BufferedInput } from './BufferedInput'
import { SheetTabs } from './SheetTabs'

// Human label for the page a "← Back" link returns to, keyed by the origin page id.
const BACK_LABEL: Partial<Record<string, string>> = {
  records: 'Companies',
  people: 'People',
  segments: 'Audiences',
  tasks: 'Tasks',
  proofpoints: 'Proof points',
  messages: 'Messages',
  voices: 'Voices',
  patterns: 'Patterns',
  objectives: 'Objectives',
  triggers: 'Triggers',
  channelrecords: 'Channels',
}

// What a blank cell needs, shown in a tooltip beside the "needs info" flag. Status/ref cells are
// dropdowns (pick a value); the rest are typed in or need to be sourced.
function cellHint(col: RecordColumn): string {
  const l = col.label.toLowerCase()
  if (col.options) return `Set a ${l} — pick one from the dropdown`
  switch (col.kind) {
    case 'status':
      return `Set a ${l} — pick one from the dropdown`
    case 'ref':
      return `Link a ${l} from the dropdown`
    case 'url':
      return `Add the ${l}`
    case 'colors':
      return `Add ${l} in the record's details`
    default:
      return `Add the ${l}`
  }
}

/**
 * A generic spreadsheet-style Records table. Every text cell edits inline; Status is a
 * select tinted off its value; a `url` field renders an open-in-new affordance. Click a
 * header to sort. One component drives Companies, People, and any future record type —
 * pass its columns, rows, status options, and store actions.
 */
export function RecordsTable<T extends { id: string }>({
  title,
  term,
  icon,
  columns: allColumns,
  fields: allFields,
  statuses,
  rows,
  noun,
  onAdd,
  onUpdate,
  onDelete,
  rowAction,
  headerAction,
  relatedSlot,
  fieldOptions,
}: {
  title: string
  /** Optional glossary key: shows an InfoTip beside the title defining this record type. */
  term?: string
  icon: ReactNode
  columns: RecordColumn[]
  fields: RecordField[]
  statuses: string[]
  rows: T[]
  noun: [string, string]
  onAdd: () => string | void
  onUpdate: (id: string, patch: Partial<T>) => void
  onDelete: (id: string) => void
  /** Optional per-row action button (e.g. "Build flow" on a campaign row). */
  rowAction?: { label: string; run: (row: T) => void }
  /** Optional secondary header button(s), shown left of "+ New" (e.g. a guided add flow, a
   *  cleanup pass). One or several; order is render order. */
  headerAction?: { label: string; run: () => void } | { label: string; run: () => void }[]
  /** Optional related-records section shown at the bottom of the drawer (e.g. people at a company). */
  relatedSlot?: (record: T) => ReactNode
  /** Options for `ref`-kind fields, keyed by field key (e.g. the brand's segment names). */
  fieldOptions?: Record<string, string[]>
}) {
  // Progressive disclosure: in Simple detail level, hide advanced-tier columns/fields (with a
  // per-table "Show all" escape); Advanced (or unset) shows everything.
  const skillLevel = useTrafficStore((s) => s.userPrefs.skillLevel)
  const [showAllCols, setShowAllCols] = useState(false)
  const columns = showAllCols ? allColumns : visibleForSkill(allColumns, skillLevel)
  const fields = showAllCols ? allFields : visibleForSkill(allFields, skillLevel)
  const hiddenCount = allColumns.length - columns.length
  const [sortKey, setSortKey] = useState<string>(columns[0]?.key ?? 'name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [openId, setOpenId] = useState<string | null>(null)
  const openRecord = openId ? rows.find((r) => r.id === openId) ?? null : null

  // Any status/text column can organize the sheet into groups (Companies by segment, People by
  // company, channels by type, …). The name column is unique per row so it's never groupable.
  const groupCols = useMemo(
    () => columns.filter((c) => c.key !== 'name' && (c.kind === 'status' || c.kind === 'text' || c.kind === 'ref')),
    [columns],
  )

  // Grouping is remembered per sheet (keyed by title) so the choice survives reloads. Ignore a
  // saved field that's no longer a groupable column (e.g. after a schema change).
  const [groupKey, setGroupKey] = useState<string | null>(() => {
    const saved = loadRecordGrouping(title)
    return saved && groupCols.some((c) => c.key === saved) ? saved : null
  })
  const changeGroup = (v: string | null) => {
    setGroupKey(v)
    saveRecordGrouping(title, v)
  }

  // A cross-view request to open a specific record (e.g. from a task's linked company). Only the
  // table that actually holds the id reacts, then it clears the signal.
  const focusRecordId = useTrafficStore((s) => s.focusRecordId)
  const focusRecord = useTrafficStore((s) => s.focusRecord)
  // If we arrived here by jumping into a record from another page, offer a "← Back" out of it.
  const recordBackTo = useTrafficStore((s) => s.recordBackTo)
  const setPage = useTrafficStore((s) => s.setPage)
  // Brand in view (from the rail), so the assistant's edits and answers stay scoped to it.
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const chatBrand = clientFilter && clientFilter !== 'all' ? clientFilter : ''
  useEffect(() => {
    if (focusRecordId && rows.some((r) => r.id === focusRecordId)) {
      setOpenId(focusRecordId)
      focusRecord(null)
    }
  }, [focusRecordId, rows, focusRecord])

  // Wide records tables are painful to scroll sideways (trackpad two-finger only). Turn a
  // plain vertical wheel into horizontal scroll while there's room, then hand vertical back
  // at the edges so the page still scrolls. Native + non-passive so we can preventDefault.
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (el.scrollWidth <= el.clientWidth) return
      const atStart = el.scrollLeft <= 0
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
      if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atStart)) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const val = (r: T, k: string) => ((r as Record<string, unknown>)[k] ?? '').toString()

  const sorted = useMemo(() => {
    const list = [...rows]
    list.sort((a, b) => {
      // When grouping, keep same-group rows adjacent (empty group values sort last).
      if (groupKey) {
        const ga = val(a, groupKey).toLowerCase()
        const gb = val(b, groupKey).toLowerCase()
        if (ga !== gb) return !ga ? 1 : !gb ? -1 : ga < gb ? -1 : 1
      }
      const av = val(a, sortKey).toLowerCase()
      const bv = val(b, sortKey).toLowerCase()
      if (av === bv) return 0
      const cmp = av < bv ? -1 : 1
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [rows, sortKey, sortDir, groupKey])

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

  // Consecutive columns sharing a group render under one section header (Brand-Foundation style).
  const hasGroups = columns.some((c) => c.group)
  const groupSpans = columns.reduce<{ label: string; span: number }[]>((acc, col) => {
    const g = col.group ?? ''
    const last = acc[acc.length - 1]
    if (last && last.label === g) last.span++
    else acc.push({ label: g, span: 1 })
    return acc
  }, [])

  // Spreadsheet keyboard nav across the editable text cells. Focusing a new cell blurs the
  // current one, which commits it (BufferedInput commits on blur). Status/colors cells are skipped.
  const navCols = columns.map((c, i) => (c.kind === 'status' || c.kind === 'colors' ? -1 : i)).filter((i) => i >= 0)
  const focusCell = (r: number, c: number): boolean => {
    const el = wrapRef.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`)
    if (el) {
      el.focus()
      el.select()
    }
    return !!el
  }
  const stepCol = (c: number, dir: 1 | -1): number => navCols[navCols.indexOf(c) + dir] ?? -1
  const onCellKey = (e: ReactKeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      focusCell(e.shiftKey ? r - 1 : r + 1, c)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusCell(r + 1, c)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusCell(r - 1, c)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const nc = stepCol(c, e.shiftKey ? -1 : 1)
      if (nc >= 0) focusCell(r, nc)
      else if (e.shiftKey) focusCell(r - 1, navCols[navCols.length - 1])
      else focusCell(r + 1, navCols[0])
    }
  }
  // Paste a block copied from a real spreadsheet (tab = columns, newline = rows) starting at the
  // focused cell: fill existing rows, and spin up new records (onAdd returns the id) for any extra
  // pasted rows. A plain single-value paste falls through to the browser.
  const onCellPaste = (e: ReactClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain')
    if (!/[\t\n]/.test(text.replace(/\n+$/, ''))) return
    e.preventDefault()
    const matrix = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((line) => line.split('\t'))
    matrix.forEach((cells, ri2) => {
      const existing = sorted[r + ri2]
      let id = existing?.id
      if (!id) {
        const added = onAdd()
        if (typeof added !== 'string') return // this record type can't create rows from paste
        id = added
      }
      cells.forEach((cellVal, ci2) => {
        const col = columns[c + ci2]
        if (!col || col.kind === 'colors') return
        onUpdate(id as string, { [col.key]: cellVal } as Partial<T>)
      })
    })
  }

  return (
    <div className="rec-with-chat">
    <RecordsChat
      recordType={title}
      noun={noun}
      brand={chatBrand}
      fields={fields}
      statuses={statuses}
      fieldOptions={fieldOptions}
      rows={rows as unknown as ({ id: string } & Record<string, unknown>)[]}
      onAdd={onAdd}
      onUpdate={onUpdate as unknown as (id: string, patch: Partial<Record<string, unknown>>) => void}
      onDelete={onDelete}
    />
    <div className="rec">
      {recordBackTo && (
        <button className="rec-back" onClick={() => setPage(recordBackTo)}>
          <span aria-hidden="true">←</span> {BACK_LABEL[recordBackTo] ?? 'Back'}
        </button>
      )}
      <header className="rec-head">
        <div className="rec-title">
          <span className="rec-title-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              {icon}
            </svg>
          </span>
          {title}
          {term && <InfoTip term={term} />}
        </div>
        <div className="rec-head-actions">
          {(Array.isArray(headerAction) ? headerAction : headerAction ? [headerAction] : []).map((a) => (
            <button key={a.label} className="rec-new rec-new-ghost" onClick={a.run}>
              {a.label}
            </button>
          ))}
          <button className="rec-new" onClick={onAdd}>
            + New {noun[0]}
          </button>
        </div>
      </header>

      <div className="rec-sub">
        <span className="rec-sub-count">
          {rows.length} {rows.length === 1 ? noun[0] : noun[1]}
        </span>
        <span className="rec-sub-sort">
          Sorted by {sortLabel} {sortDir === 'asc' ? '↑' : '↓'}
        </span>
        {(hiddenCount > 0 || showAllCols) && (
          <button className="rec-sub-showall" onClick={() => setShowAllCols((v) => !v)}>
            {showAllCols ? 'Show fewer' : `Show all ${allColumns.length} fields`}
          </button>
        )}
        {groupCols.length > 0 && (
          <label className={`rec-sub-group${groupKey ? ' on' : ''}`}>
            <span className="rec-sub-group-ic" aria-hidden="true">⊟</span>
            <select
              className="rec-sub-group-sel"
              value={groupKey ?? ''}
              onChange={(e) => changeGroup(e.target.value || null)}
              aria-label="Group rows by a field"
            >
              <option value="">No grouping</option>
              {groupCols.map((c) => (
                <option key={c.key} value={c.key}>
                  Group by {c.label.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="rec-table-wrap" ref={wrapRef}>
        <table className={`rec-table${hasGroups ? ' grouped' : ''}`} style={{ minWidth: totalWidth }}>
          <thead>
            {hasGroups && (
              <tr className="rec-group-row">
                {groupSpans.map((g, i) => (
                  <th key={i} colSpan={g.span} className={`rec-group-th${g.label ? '' : ' rec-group-empty'}`}>
                    {g.label}
                  </th>
                ))}
                {rowAction && <th className="rec-group-th rec-group-empty" aria-hidden="true" />}
                <th className="rec-th-del" aria-hidden="true" />
              </tr>
            )}
            <tr>
              {columns.map((col) => {
                const canSort = col.sortable !== false
                return (
                  <th
                    key={col.key}
                    className={[col.kind === 'name' ? 'rec-th-name' : '', canSort ? '' : 'rec-th-nosort'].filter(Boolean).join(' ') || undefined}
                    style={{ width: col.width }}
                    onClick={canSort ? () => toggleSort(col.key) : undefined}
                  >
                    <span className="rec-th-label">{col.label}</span>
                    {canSort && sortKey === col.key && <span className="rec-th-sort">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                )
              })}
              {rowAction && <th className="rec-th-act" aria-hidden="true" />}
              <th className="rec-th-del" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, ri) => {
              const name = val(r, 'name')
              const groupHead =
                groupKey && (ri === 0 || val(sorted[ri - 1], groupKey) !== val(r, groupKey))
                  ? val(r, groupKey) || 'Unassigned'
                  : null
              return (
                <Fragment key={r.id}>
                  {groupHead != null && (
                    <tr className="rec-rowgroup">
                      <td colSpan={columns.length + (rowAction ? 2 : 1)}>{groupHead}</td>
                    </tr>
                  )}
                  <tr>
                  {columns.map((col, ci) => {
                    const v = val(r, col.key)
                    // Flag a blank, fillable cell so it's clear what still needs info (name is the
                    // record itself; colors edits in the drawer).
                    const needsInfo = !String(v ?? '').trim() && col.kind !== 'name' && col.kind !== 'colors'
                    return (
                      <td key={col.key} className={`rec-td rec-td-${col.kind}`} style={needsInfo ? { position: 'relative' } : undefined} title={needsInfo ? cellHint(col) : undefined}>
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
                            <BufferedInput className="rec-cell rec-cell-name" value={v} onCommit={(nv) => set(r.id, col.key, nv)} cellR={ri} cellC={ci} onKeyDown={(e) => onCellKey(e, ri, ci)} onPaste={(e) => onCellPaste(e, ri, ci)} />
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
                            <BufferedInput className="rec-cell rec-cell-url" placeholder="—" value={v} onCommit={(nv) => set(r.id, col.key, nv)} cellR={ri} cellC={ci} onKeyDown={(e) => onCellKey(e, ri, ci)} onPaste={(e) => onCellPaste(e, ri, ci)} />
                            {v && (
                              <a className="rec-url-go" href={`https://${v.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" title="Open">
                                ↗
                              </a>
                            )}
                          </div>
                        ) : col.kind === 'colors' ? (
                          <button className="rec-colors" title="Edit in details" onClick={() => setOpenId(r.id)}>
                            {v.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean).map((c, j) => (
                              <span key={j} className="rec-swatch" style={{ background: c }} title={c} />
                            ))}
                            {!v.trim() && <span className="rec-cell-muted">—</span>}
                          </button>
                        ) : col.kind === 'ref' ? (
                          <select
                            className="rec-status rec-ref"
                            style={{ color: v ? recordTint(v) : undefined }}
                            value={v}
                            onChange={(e) => set(r.id, col.key, e.target.value)}
                          >
                            <option value="">—</option>
                            {(fieldOptions?.[col.key] ?? []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                            {v && !(fieldOptions?.[col.key] ?? []).includes(v) && <option value={v}>{v}</option>}
                          </select>
                        ) : col.options ? (
                          <select
                            className={`rec-status rec-ref${optionsAreSentences(col.options) ? ' as-written' : ''}`}
                            style={{ color: v ? recordTint(v) : undefined }}
                            value={v}
                            onChange={(e) => set(r.id, col.key, e.target.value)}
                          >
                            <option value="">—</option>
                            {col.options.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                            {v && !col.options.includes(v) && <option value={v}>{v}</option>}
                          </select>
                        ) : (
                          <BufferedInput className="rec-cell" placeholder="—" value={v} onCommit={(nv) => set(r.id, col.key, nv)} cellR={ri} cellC={ci} onKeyDown={(e) => onCellKey(e, ri, ci)} onPaste={(e) => onCellPaste(e, ri, ci)} />
                        )}
                        {needsInfo && (
                          <span aria-label={cellHint(col)} title={cellHint(col)} style={{ position: 'absolute', top: 3, left: 3, lineHeight: 0, pointerEvents: 'none' }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#d9930b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 21V4" />
                              <path d="M5 4h12l-2.5 4L17 12H5" />
                            </svg>
                          </span>
                        )}
                      </td>
                    )
                  })}
                  {rowAction && (
                    <td className="rec-td rec-td-act">
                      <button className="rec-rowact" onClick={() => rowAction.run(r)}>
                        {rowAction.label}
                      </button>
                    </td>
                  )}
                  <td className="rec-td rec-td-del">
                    <button className="rec-del" title={`Delete ${noun[0]}`} aria-label={`Delete ${noun[0]}`} onClick={() => onDelete(r.id)}>
                      ✕
                    </button>
                  </td>
                  </tr>
                </Fragment>
              )
            })}
            <tr className="rec-add-row" onClick={onAdd}>
              <td colSpan={columns.length + (rowAction ? 2 : 1)} className="rec-add-cell">
                + New {noun[0]}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <SheetTabs />

      {openRecord && (
        <RecordDrawer
          record={openRecord}
          fields={fields}
          statuses={statuses}
          fieldOptions={fieldOptions}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onClose={() => setOpenId(null)}
          related={relatedSlot?.(openRecord)}
        />
      )}
    </div>
    </div>
  )
}
