import { useLayoutEffect, useRef, useState } from 'react'
import { CHANNELS, KIND_ORDER, channelsByKind } from '../domain/channels'
import { primarySlotKey, slotsFor } from '../domain/channelAssets'
import type { ChannelId, RowStatus, TrafficRow } from '../domain/types'
import { isoToLocalInput, localInputToIso } from '../lib/format'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { CompletenessBar } from './CompletenessBar'
import { Thumb } from './Thumb'

const STATUSES: RowStatus[] = ['draft', 'approved', 'scheduled', 'posted', 'failed']

// Named columns of the spreadsheet, in order, with a Clay-style type glyph.
const COLUMNS = [
  { key: 'asset', label: 'Asset', icon: '▦' },
  { key: 'type', label: 'Type', icon: 'T' },
  { key: 'channel', label: 'Channel', icon: '◉' },
  { key: 'format', label: 'Format', icon: '▱' },
  { key: 'campaign', label: 'Campaign', icon: '◇' },
  { key: 'audience', label: 'Audience', icon: '◎' },
  { key: 'caption', label: 'Caption', icon: '¶' },
  { key: 'scheduled', label: 'Scheduled', icon: '◷' },
  { key: 'status', label: 'Status', icon: '●' },
  { key: 'posted', label: 'Posted', icon: '✓' },
  { key: 'actions', label: '', icon: '' },
] as const

// Widths include the leading row-number gutter (index 0), then one per COLUMN.
const DEFAULT_WIDTHS = [40, 220, 70, 140, 150, 150, 150, 320, 184, 138, 120, 120]
const MIN_COL = 60
const MIN_ROWS = 20
const colLetter = (i: number) => String.fromCharCode(65 + i)

function postedLabel(row: TrafficRow): string {
  if (!row.postedAt) return '—'
  return new Date(row.postedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function CovBar({ n, total }: { n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0
  return (
    <div className="cov">
      <div className="cov-bar">
        <div className="cov-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="cov-pct">{pct}%</span>
    </div>
  )
}

/** Auto-growing text cell: wraps content and expands the row to fit. `dep`
 *  forces a re-measure when the column width changes. */
function GrowCell({
  value,
  placeholder,
  onChange,
  dep,
}: {
  value: string
  placeholder?: string
  onChange: (v: string) => void
  dep: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value, dep])
  return (
    <textarea
      ref={ref}
      className="cell-input grow"
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function SheetGrid() {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const query = useTrafficStore((s) => s.query)
  const updateRow = useTrafficStore((s) => s.updateRow)
  const removeRow = useTrafficStore((s) => s.removeRow)
  const duplicateRow = useTrafficStore((s) => s.duplicateRow)
  const publishRow = useTrafficStore((s) => s.publishRow)
  const loadSample = useTrafficStore((s) => s.loadSample)
  const openReview = useTrafficStore((s) => s.openReview)

  const [widths, setWidths] = useState<number[]>(DEFAULT_WIDTHS)
  const total = widths.reduce((a, b) => a + b, 0)

  function startResize(idx: number, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widths[idx]
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(MIN_COL, startW + (ev.clientX - startX))
      setWidths((prev) => {
        const next = [...prev]
        next[idx] = w
        return next
      })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const q = query.trim().toLowerCase()
  const view = rows.filter(
    (r) =>
      (filter === 'all' || r.channel === filter) &&
      (q === '' ||
        r.assetName.toLowerCase().includes(q) ||
        r.caption.toLowerCase().includes(q) ||
        r.channel.includes(q)),
  )

  const totalRows = view.length
  const captionFilled = view.filter((r) => r.caption.trim()).length
  const campaignFilled = view.filter((r) => (r.campaign ?? '').trim()).length
  const audienceFilled = view.filter((r) => (r.audience ?? '').trim()).length
  const pastDraft = view.filter((r) => r.status !== 'draft').length
  const postedN = view.filter((r) => r.status === 'posted').length

  const pad = Math.max(0, MIN_ROWS - view.length)

  function onStatusChange(row: TrafficRow, status: RowStatus) {
    updateRow(row.id, {
      status,
      approvedAt: status === 'approved' ? row.approvedAt ?? Date.now() : row.approvedAt,
      postedAt: status === 'posted' ? row.postedAt ?? Date.now() : row.postedAt,
    })
  }

  return (
    <div className="sheet-grid">
      <CompletenessBar />
      <div className="sheet-wrap">
        {rows.length === 0 && (
          <div className="sheet-hint">
            <div>
              Drag assets anywhere here, or click <b>+ Add assets</b> to start the sheet.
            </div>
            <button
              className="btn sm"
              style={{ marginTop: 12, pointerEvents: 'auto' }}
              onClick={loadSample}
            >
              Load sample data
            </button>
          </div>
        )}
        <table className="sheet" style={{ tableLayout: 'fixed', width: total, minWidth: total }}>
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr className="letters">
              <th className="corner" />
              {COLUMNS.map((_, i) => (
                <th key={i}>{colLetter(i)}</th>
              ))}
            </tr>
            <tr className="names">
              <th className="corner">#</th>
              {COLUMNS.map((c, i) => (
                <th key={c.key}>
                  {c.icon && <span className="col-ico">{c.icon}</span>}
                  {c.label}
                  <span className="col-resizer" onMouseDown={(e) => startResize(i + 1, e)} />
                </th>
              ))}
            </tr>
            <tr className="coverage">
              <th className="corner">%</th>
              <th><span className="cov-check">✓</span></th>
              <th><span className="cov-check">✓</span></th>
              <th><span className="cov-check">✓</span></th>
              <th><span className="cov-check">✓</span></th>
              <th><CovBar n={campaignFilled} total={totalRows} /></th>
              <th><CovBar n={audienceFilled} total={totalRows} /></th>
              <th><CovBar n={captionFilled} total={totalRows} /></th>
              <th><span className="cov-check">✓</span></th>
              <th><CovBar n={pastDraft} total={totalRows} /></th>
              <th><CovBar n={postedN} total={totalRows} /></th>
              <th />
            </tr>
          </thead>
          <tbody>
            {view.map((row, i) => (
              <tr key={row.id}>
                <td className="gutter">{i + 1}</td>

                <td>
                  <div className="sheet-asset">
                    <div className="mini">
                      <Thumb mediaType={row.mediaType} url={row.mediaRef} />
                    </div>
                    <span className="nm" title={row.assetName}>
                      {row.assetName}
                    </span>
                  </div>
                </td>

                <td className="cell-ro">{row.mediaType}</td>

                <td>
                  <div className="ch-cell">
                    <ChannelIcon channel={row.channel} size={15} />
                    <select
                      className="cell-select"
                      style={{ color: CHANNELS[row.channel].color }}
                      value={row.channel}
                      onChange={(e) => {
                        const channel = e.target.value as ChannelId
                        updateRow(row.id, { channel, format: primarySlotKey(channel) })
                      }}
                    >
                      {KIND_ORDER.map((section) => (
                        <optgroup key={section.kind} label={section.label}>
                          {channelsByKind(section.kind).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </td>

                <td>
                  <select
                    className="cell-select"
                    value={row.format ?? primarySlotKey(row.channel)}
                    onChange={(e) => updateRow(row.id, { format: e.target.value })}
                  >
                    {slotsFor(row.channel).map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>

                <td>
                  <GrowCell
                    value={row.campaign ?? ''}
                    placeholder="—"
                    dep={total}
                    onChange={(v) => updateRow(row.id, { campaign: v })}
                  />
                </td>

                <td>
                  <GrowCell
                    value={row.audience ?? ''}
                    placeholder="—"
                    dep={total}
                    onChange={(v) => updateRow(row.id, { audience: v })}
                  />
                </td>

                <td>
                  <GrowCell
                    value={row.caption}
                    placeholder="Add copy…"
                    dep={total}
                    onChange={(v) => updateRow(row.id, { caption: v })}
                  />
                </td>

                <td>
                  <input
                    className="cell-input"
                    type="datetime-local"
                    value={isoToLocalInput(row.scheduledAt)}
                    onChange={(e) =>
                      updateRow(row.id, { scheduledAt: localInputToIso(e.target.value) })
                    }
                  />
                </td>

                <td>
                  <select
                    className={`cell-select st-${row.status}`}
                    value={row.status}
                    onChange={(e) => onStatusChange(row, e.target.value as RowStatus)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="cell-ro">{postedLabel(row)}</td>

                <td className="act">
                  <button
                    className={`btn ghost sm${row.copyReviewed ? ' reviewed' : ''}`}
                    title={row.copyReviewed ? 'Copy reviewed — open' : 'Review copy'}
                    onClick={() => openReview(row.id)}
                  >
                    {row.copyReviewed ? '✓' : '✎'}
                  </button>
                  {(row.status === 'approved' || row.status === 'failed') && (
                    <button className="btn sm" onClick={() => publishRow(row.id)}>
                      Publish
                    </button>
                  )}
                  <button
                    className="btn ghost sm"
                    title="Duplicate row (re-traffic to another channel)"
                    onClick={() => duplicateRow(row.id)}
                  >
                    ⎘
                  </button>
                  <button
                    className="btn ghost sm"
                    title="Remove row"
                    onClick={() => removeRow(row.id)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}

            {Array.from({ length: pad }).map((_, i) => (
              <tr key={`pad-${i}`} className="pad-row">
                <td className="gutter">{view.length + i + 1}</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
