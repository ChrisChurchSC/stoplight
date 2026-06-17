import { useLayoutEffect, useRef, useState } from 'react'
import { CHANNELS, KIND_ORDER, channelsByKind } from '../domain/channels'
import { isValidType, typesFor } from '../domain/channelAssetTypes'
import { messagingAllText, messagingFields, messagingMap } from '../domain/messaging'
import { isTrackingClean, trackingChecks, utmQuery } from '../domain/tracking'
import { PACE_LABEL, hasBudget, isPaidRow, money, pacing } from '../domain/budget'
import { flagResolved } from '../adapters/icp/mockIcp'
import { mockAttio } from '../adapters/attio/mockAttio'
import { assetRtbIds, rtbById } from '../domain/rtb'
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
  { key: 'channel', label: 'Channel', icon: '◉' },
  { key: 'type', label: 'Type', icon: '◆' },
  { key: 'campaign', label: 'Campaign', icon: '◇' },
  { key: 'audience', label: 'Audience', icon: '◎' },
  { key: 'messaging', label: 'Messaging', icon: '¶' },
  { key: 'rtb', label: 'RTB', icon: '◆' },
  { key: 'scheduled', label: 'Scheduled', icon: '◷' },
  { key: 'status', label: 'Status', icon: '●' },
  { key: 'tracking', label: 'Tracking', icon: '◈' },
  { key: 'budget', label: 'Budget', icon: '◧' },
  { key: 'attribution', label: 'Attribution', icon: '↗' },
  { key: 'posted', label: 'Posted', icon: '✓' },
  { key: 'comments', label: 'Comments', icon: '💬' },
  { key: 'actions', label: '', icon: '' },
] as const

// Widths include the leading row-number gutter (index 0), then one per COLUMN.
const DEFAULT_WIDTHS = [40, 220, 140, 160, 150, 150, 320, 300, 184, 138, 200, 200, 150, 120, 150, 130]
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

/** Auto-growing text cell: wraps content and expands the row to fit. */
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
  const openReview = useTrafficStore((s) => s.openReview)
  const openComments = useTrafficStore((s) => s.openComments)
  const commentMap = useTrafficStore((s) => s.comments)
  const generateTrackingForRow = useTrafficStore((s) => s.generateTrackingForRow)
  const batchReview = useTrafficStore((s) => s.batchReview)
  const icp = useTrafficStore((s) => s.icp)

  const pains = icp?.pains ?? []
  const unresolvedFlags = (row: TrafficRow) =>
    batchReview
      ? batchReview.flags.filter((fl) => fl.rowId === row.id && !flagResolved(fl, row, pains)).length
      : 0

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
        messagingAllText(r).toLowerCase().includes(q) ||
        r.channel.includes(q)),
  )

  const totalRows = view.length
  const typeSet = view.filter((r) => isValidType(r.channel, r.assetType)).length
  const messagingFilled = view.filter((r) => messagingAllText(r).trim()).length
  const rtbSetN = view.filter((r) => assetRtbIds(r).length > 0).length
  const campaignFilled = view.filter((r) => (r.campaign ?? '').trim()).length
  const audienceFilled = view.filter((r) => (r.audience ?? '').trim()).length
  const pastDraft = view.filter((r) => r.status !== 'draft').length
  const postedN = view.filter((r) => r.status === 'posted').length
  const trackingCleanN = view.filter((r) => r.utm && isTrackingClean(r)).length
  const paidN = view.filter(isPaidRow).length
  const budgetSetN = view.filter((r) => isPaidRow(r) && hasBudget(r)).length
  const attributedN = view.filter((r) => {
    const a = mockAttio.attributionForAsset(r.assetName)
    return a.leads > 0 || a.wonRevenue > 0
  }).length
  const commentedN = view.filter((r) => (commentMap[r.id]?.length ?? 0) > 0).length
  const now = Date.now()

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
              onClick={loadSampleHint}
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
              <th><CovBar n={typeSet} total={totalRows} /></th>
              <th><CovBar n={campaignFilled} total={totalRows} /></th>
              <th><CovBar n={audienceFilled} total={totalRows} /></th>
              <th><CovBar n={messagingFilled} total={totalRows} /></th>
              <th><CovBar n={rtbSetN} total={totalRows} /></th>
              <th><span className="cov-check">✓</span></th>
              <th><CovBar n={pastDraft} total={totalRows} /></th>
              <th><CovBar n={trackingCleanN} total={totalRows} /></th>
              <th><CovBar n={budgetSetN} total={paidN} /></th>
              <th><CovBar n={attributedN} total={totalRows} /></th>
              <th><CovBar n={postedN} total={totalRows} /></th>
              <th><CovBar n={commentedN} total={postedN} /></th>
              <th />
            </tr>
          </thead>
          <tbody>
            {view.map((row, i) => {
              const typeValid = isValidType(row.channel, row.assetType)
              return (
                <tr
                  key={row.id}
                  className="data-row"
                  onClick={(e) => {
                    // Open the editor for clicks on dead space, but let inline
                    // controls (selects, inputs, buttons) handle their own clicks.
                    const t = e.target as HTMLElement
                    if (t.closest('input, select, textarea, button, code, a, .col-resizer'))
                      return
                    openReview(row.id)
                  }}
                >
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

                  <td>
                    <div className="ch-cell">
                      <ChannelIcon channel={row.channel} size={15} />
                      <select
                        className="cell-select"
                        style={{ color: CHANNELS[row.channel].color }}
                        value={row.channel}
                        onChange={(e) => {
                          const channel = e.target.value as ChannelId
                          // Keep the type only if still valid for the new channel; else clear & prompt.
                          const assetType = isValidType(channel, row.assetType) ? row.assetType : ''
                          updateRow(row.id, { channel, assetType })
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
                      className={`cell-select${typeValid ? '' : ' unset'}`}
                      value={typeValid ? row.assetType : ''}
                      onChange={(e) => updateRow(row.id, { assetType: e.target.value })}
                    >
                      {!typeValid && <option value="">Select…</option>}
                      {typesFor(row.channel).map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
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

                  <td
                    className="msg-cell"
                    onClick={() => openReview(row.id)}
                    title="Open messaging"
                  >
                    {(() => {
                      const map = messagingMap(row)
                      const filled = messagingFields(row.channel, row.assetType).filter(
                        (fl) => (map[fl.key] ?? '').trim(),
                      )
                      const flagged = (key: string) =>
                        !!batchReview &&
                        batchReview.flags.some(
                          (f) => f.rowId === row.id && f.field?.key === key && !flagResolved(f, row, pains),
                        )
                      if (filled.length === 0) return <span className="msg-empty">Add messaging…</span>
                      return (
                        <div className="msg-pills">
                          {filled.map((fl) => {
                            const copy = (map[fl.key] ?? '').trim()
                            return (
                              <span
                                key={fl.key}
                                className={`msg-pill${flagged(fl.key) ? ' flagged' : ''}`}
                                title={`${fl.label}: ${copy}`}
                              >
                                <span className="msg-pill-key">{fl.label}</span>
                                <span className="msg-pill-copy">{copy}</span>
                              </span>
                            )
                          })}
                          {unresolvedFlags(row) > 0 && (
                            <span className="msg-flags" title="Unresolved ICP flags">
                              ⚑ {unresolvedFlags(row)}
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </td>

                  <td
                    className="rtb-cell"
                    onClick={() => openReview(row.id)}
                    title="Map proof (RTBs) in messaging"
                  >
                    {(() => {
                      const map = messagingMap(row)
                      const fields = messagingFields(row.channel, row.assetType)
                      const labelFor = (key: string) =>
                        fields.find((f) => f.key === key)?.label ?? key
                      const entries = Object.entries(row.rtbMap ?? {}).filter(
                        ([, ids]) => ids.length,
                      )
                      if (entries.length) {
                        return (
                          <div className="rtb-map">
                            {entries.map(([key, ids]) => (
                              <div key={key} className="rtb-map-row">
                                <span
                                  className="rtb-map-claim"
                                  title={(map[key] ?? '').trim() || labelFor(key)}
                                >
                                  {labelFor(key)}
                                </span>
                                <span className="rtb-map-proof">
                                  {ids.map((id) => (
                                    <span
                                      key={id}
                                      className="rtb-mini"
                                      title={rtbById(row.campaign, id)?.detail}
                                    >
                                      {rtbById(row.campaign, id)?.label ?? id}
                                    </span>
                                  ))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )
                      }
                      return messagingAllText(row).trim() ? (
                        <span className="rtb-warn">unsupported</span>
                      ) : (
                        <span className="cell-ro">—</span>
                      )
                    })()}
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

                  <td className="track-cell">
                    {row.utm ? (
                      (() => {
                        const checks = trackingChecks(row)
                        const clean = checks.every((c) => c.ok)
                        const bad = checks.filter((c) => !c.ok).map((c) => c.label)
                        return (
                          <div
                            className="track-cell-inner"
                            title={clean ? utmQuery(row.utm) : `Missing: ${bad.join(', ')}`}
                          >
                            <span className={`trk ${clean ? 'ok' : 'bad'}`}>
                              {clean ? '✓ Tracked' : `⚑ ${bad.length}`}
                            </span>
                            <code className="trk-utm">?{utmQuery(row.utm)}</code>
                          </div>
                        )
                      })()
                    ) : (
                      <button
                        className="btn ghost sm"
                        onClick={() => generateTrackingForRow(row.id)}
                      >
                        Generate
                      </button>
                    )}
                  </td>

                  <td className="budget-cell">
                    {isPaidRow(row) ? (
                      <div className="bud">
                        <div className="bud-line">
                          <span className="bud-cur">$</span>
                          <input
                            className="bud-amt"
                            type="number"
                            min="0"
                            placeholder="0"
                            value={row.budget?.amount || ''}
                            onChange={(e) =>
                              updateRow(row.id, {
                                budget: {
                                  amount: Number(e.target.value) || 0,
                                  type: row.budget?.type ?? 'daily',
                                  endDate: row.budget?.endDate,
                                },
                              })
                            }
                          />
                          <select
                            className="bud-type"
                            value={row.budget?.type ?? 'daily'}
                            onChange={(e) =>
                              updateRow(row.id, {
                                budget: {
                                  amount: row.budget?.amount ?? 0,
                                  type: e.target.value as 'daily' | 'lifetime',
                                  endDate: row.budget?.endDate,
                                },
                              })
                            }
                          >
                            <option value="daily">daily</option>
                            <option value="lifetime">lifetime</option>
                          </select>
                        </div>
                        {row.spend &&
                          (() => {
                            const p = pacing(row, now)
                            return (
                              <span className={`pace pace-${p.status}`} title={`Planned ${money(p.planned)} · spent ${money(p.spent)}`}>
                                {money(p.spent)} · {PACE_LABEL[p.status]}
                              </span>
                            )
                          })()}
                      </div>
                    ) : (
                      <span className="cell-ro">—</span>
                    )}
                  </td>

                  <td className="attr-cell">
                    {(() => {
                      const a = mockAttio.attributionForAsset(row.assetName)
                      if (!a.leads && !a.wonRevenue) return <span className="cell-ro">—</span>
                      return (
                        <div className="attr">
                          {a.wonRevenue > 0 && <span className="attr-rev">{money(a.wonRevenue)}</span>}
                          <span className="attr-leads">
                            {a.leads} lead{a.leads === 1 ? '' : 's'}
                            {a.openDeals ? ` · ${a.openDeals} open` : ''}
                          </span>
                        </div>
                      )
                    })()}
                  </td>

                  <td className="cell-ro">{postedLabel(row)}</td>

                  <td className="comments-cell">
                    {row.status === 'posted'
                      ? (() => {
                          const cs = commentMap[row.id] ?? []
                          const needs = cs.filter((c) => c.needsResponse).length
                          if (cs.length === 0)
                            return (
                              <button
                                className="comments-link muted"
                                onClick={() => openComments(row.id)}
                                title="Sync comments to pull replies"
                              >
                                No comments
                              </button>
                            )
                          return (
                            <button
                              className="comments-link"
                              onClick={() => openComments(row.id)}
                              title="Open comments"
                            >
                              💬 {cs.length}
                              {needs > 0 && (
                                <span className="comments-badge" title={`${needs} need a reply`}>
                                  {needs} to reply
                                </span>
                              )}
                            </button>
                          )
                        })()
                      : <span className="cell-ro">—</span>}
                  </td>

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
              )
            })}

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

// Load-sample handler reads the store lazily so the empty-state button works.
function loadSampleHint() {
  void useTrafficStore.getState().loadSample()
}
