import { BufferedTextarea } from './BufferedTextarea'
import { CopyFields } from './CopyFields'
import { useEffect, useState } from 'react'
import { CHANNELS, KIND_ORDER, channelsByKind } from '../domain/channels'
import { isValidType, typeLabel, typesFor } from '../domain/channelAssetTypes'
import { STATUS_LABEL, STATUS_ORDER } from '../domain/assetBadge'
import { messagingFields, messagingMap } from '../domain/messaging'
import { applyBreakStatus, detectBreaks } from '../domain/breaks'
import { rtbsForCampaign } from '../domain/rtb'
import { isTrackingClean, trackingChecks, utmQuery, type Utm } from '../domain/tracking'
import { PACE_LABEL, hasBudget, isPaidRow, money, pacing } from '../domain/budget'
import { postSpec } from '../domain/postSpec'
import { isoToLocalInput, localInputToIso } from '../lib/format'
import { flagResolved } from '../adapters/icp/mockIcp'
import type { ChannelId, RowStatus } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { ChannelPreview } from './ChannelPreview'
import { Thumb } from './Thumb'
import { proxiedMedia } from '../lib/media'

const UTM_PARTS: { key: keyof Utm; label: string }[] = [
  { key: 'source', label: 'Source' },
  { key: 'medium', label: 'Medium' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'content', label: 'Content' },
]

export function CopyReview() {
  const reviewRowId = useTrafficStore((s) => s.reviewRowId)
  const rows = useTrafficStore((s) => s.rows)
  const openReview = useTrafficStore((s) => s.openReview)
  const updateRow = useTrafficStore((s) => s.updateRow)
  const extractCopy = useTrafficStore((s) => s.extractCopy)
  const generateTrackingForRow = useTrafficStore((s) => s.generateTrackingForRow)
  const batchReview = useTrafficStore((s) => s.batchReview)
  const icp = useTrafficStore((s) => s.icp)
  const draftCopy = useTrafficStore((s) => s.draftCopy)
  const drafting = useTrafficStore((s) => s.drafting)
  const fillRowMedia = useTrafficStore((s) => s.fillRowMedia)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const openBreaks = useTrafficStore((s) => s.openBreaks)

  // Config sections collapse so the drawer opens as a review: preview + copy + sign-off.
  // Expand a section only when you actually need to edit its fields.
  const [openSec, setOpenSec] = useState<Record<'details' | 'tracking' | 'budget', boolean>>({
    details: false,
    tracking: false,
    budget: false,
  })
  const toggleSec = (k: 'details' | 'tracking' | 'budget') => setOpenSec((s) => ({ ...s, [k]: !s[k] }))

  // Reset the collapsible sections when a different asset opens. A fresh asset (no copy yet) opens
  // with Details expanded so the channel/type/date are right there to pick; an existing asset opens
  // as a clean review (all collapsed).
  useEffect(() => {
    const r = rows.find((x) => x.id === reviewRowId)
    if (!r) return
    const flds = messagingFields(r.channel, r.assetType)
    const mm = messagingMap(r)
    const hasCopy = flds.some((fl) => (mm[fl.key] ?? '').trim()) || !!(r.body ?? '').trim()
    setOpenSec({ details: !hasCopy, tracking: false, budget: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewRowId])

  const row = rows.find((r) => r.id === reviewRowId)
  if (!row) return null

  // Open connection breaks this asset is on either side of — surfaced inline so
  // the buyer meets the break while editing one asset, not only campaign-wide.
  const rowBreaks = applyBreakStatus(detectBreaks(rows), breakStatus).filter(
    (b) =>
      b.status === 'open' &&
      ((b.from.assetName === row.assetName && b.from.channel === row.channel) ||
        (b.to?.assetName === row.assetName && b.to?.channel === row.channel)),
  )

  const fields = messagingFields(row.channel, row.assetType)
  const map = messagingMap(row)
  // A fresh asset has no copy yet — keep the drawer focused on the essentials (pick channel/type,
  // write copy) and hide the go-live checklist until there's something to check.
  const fresh = !fields.some((fl) => (map[fl.key] ?? '').trim()) && !(row.body ?? '').trim()
  const pains = icp?.pains ?? []
  const isMedia = row.mediaType === 'image' || row.mediaType === 'video' || row.mediaType === 'link'
  const typeValid = isValidType(row.channel, row.assetType)
  const paid = isPaidRow(row)
  const now = Date.now()
  const specs = postSpec(row)
  const specsMet = specs.filter((s) => s.ok).length

  const liveFlags = (batchReview?.flags ?? []).filter(
    (fl) => fl.rowId === row.id && !flagResolved(fl, row, pains),
  )
  const assetFlag = liveFlags.find((fl) => !fl.field)
  const fieldFlag = (key: string) => liveFlags.find((fl) => fl.field?.key === key)

  const setField = (key: string, value: string) =>
    updateRow(row.id, { messaging: { ...map, [key]: value } })

  const rtbs = rtbsForCampaign(row.campaign)
  const toggleRtb = (key: string, rtbId: string) => {
    const rmap = row.rtbMap ?? {}
    const cur = rmap[key] ?? []
    const next = cur.includes(rtbId) ? cur.filter((x) => x !== rtbId) : [...cur, rtbId]
    updateRow(row.id, { rtbMap: { ...rmap, [key]: next } })
  }

  const setUtm = (key: keyof Utm, value: string) => {
    const cur: Utm = row.utm ?? { source: '', medium: '', campaign: '', content: '' }
    updateRow(row.id, { utm: { ...cur, [key]: value } })
  }
  const checks = row.utm ? trackingChecks(row) : []
  const trackingClean = !!row.utm && isTrackingClean(row)

  const setBudget = (patch: Partial<NonNullable<typeof row.budget>>) =>
    updateRow(row.id, {
      budget: {
        amount: row.budget?.amount ?? 0,
        type: row.budget?.type ?? 'daily',
        endDate: row.budget?.endDate,
        ...patch,
      },
    })

  return (
    <>
      <div className="drawer-scrim" onClick={() => openReview(null)} />
      <aside className="drawer">
        <div className="drawer-head">
          <strong>Edit row</strong>
          {liveFlags.length > 0 && <span className="drawer-flagcount">⚑ {liveFlags.length}</span>}
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => openReview(null)}>
            ✕
          </button>
        </div>

        <div className="drawer-asset">
          <div className="drawer-thumb">
            {row.mediaRef ? (
              <Thumb mediaType={row.mediaType} url={proxiedMedia(row.mediaRef, 560)} />
            ) : (
              <label className="drawer-thumb-upload" title="Upload creative for this slot">
                <span className="drawer-thumb-up-ico">⬆</span>
                <span>Upload</span>
                <input
                  type="file"
                  accept="image/*,video/*,.pdf,.txt,.md,.html,.json"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) fillRowMedia(row.id, f)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
            )}
          </div>
          <div>
            <div className="drawer-name">{row.assetName}</div>
            <div className="drawer-sub">
              <ChannelIcon channel={row.channel} size={13} />
              {CHANNELS[row.channel].label} · {typeLabel(row.channel, row.assetType) || '—'}
            </div>
          </div>
        </div>

        <div className="drawer-body">
          {fresh && (
            <div className="drawer-newhint">
              New asset. Pick a <strong>channel</strong> and <strong>type</strong> below, then write the copy. The go-live checks and tracking fill in as you go.
            </div>
          )}

          {/* ---- Ready to post: the specs this asset needs to go live (hidden until there's copy) ---- */}
          {!fresh && (
            <>
              <div className="drawer-section">
                Ready to post
                <span className="spacer" />
                <span className={`postspec-count${specsMet === specs.length ? ' ok' : ''}`}>
                  {specsMet}/{specs.length}
                </span>
              </div>
              <div className="postspec">
                {specs.map((s) => (
                  <div
                    key={s.key}
                    className={`postspec-item${s.ok ? ' ok' : ''}${s.fix ? ' fixable' : ''}`}
                    role={s.fix ? 'button' : undefined}
                    tabIndex={s.fix ? 0 : undefined}
                    onClick={
                      s.fix ? () => setOpenSec((v) => ({ ...v, [s.fix as 'details' | 'tracking' | 'budget']: true })) : undefined
                    }
                  >
                    <span className="postspec-mark">{s.ok ? '✓' : '○'}</span>
                    <span className="postspec-label">{s.label}</span>
                    <span className="postspec-detail">{s.detail}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ---- Preview ---- */}
          <div className="drawer-section">
            Preview
            <span className="drawer-section-note">{CHANNELS[row.channel].label} · {typeLabel(row.channel, row.assetType) || 'asset'}</span>
          </div>
          <ChannelPreview row={row} />

          {/* ---- Details (collapsed by default) ---- */}
          <div className="drawer-section drawer-sec-toggle" role="button" tabIndex={0} onClick={() => toggleSec('details')}>
            <span className="drawer-sec-caret">{openSec.details ? '▾' : '▸'}</span>
            Details
          </div>
          {openSec.details && (
          <>
          <label className="copy-field">
            <span className="copy-label">Asset name</span>
            {/* Keyed by row so opening a different asset starts a clean box rather than inheriting
                whatever the last one was holding. */}
            <BufferedTextarea
              key={row.id}
              as="input"
              className="drawer-input"
              value={row.assetName}
              onCommit={(assetName) => updateRow(row.id, { assetName })}
            />
          </label>

          <div className="drawer-grid2">
            <label className="copy-field">
              <span className="copy-label">Channel</span>
              <select
                className="drawer-input"
                value={row.channel}
                onChange={(e) => {
                  const channel = e.target.value as ChannelId
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
            </label>

            <label className="copy-field">
              <span className="copy-label">Type</span>
              <select
                className={`drawer-input${typeValid ? '' : ' unset'}`}
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
            </label>

            <label className="copy-field">
              <span className="copy-label">Campaign</span>
              {/* Free text, not a picker, so it costs a write and a full workspace read per character
                  the same way the copy boxes did. */}
              <BufferedTextarea
                key={row.id}
                as="input"
                className="drawer-input"
                value={row.campaign ?? ''}
                placeholder="—"
                onCommit={(campaign) => updateRow(row.id, { campaign })}
              />
            </label>

            <label className="copy-field">
              <span className="copy-label">Audience</span>
              <BufferedTextarea
                key={row.id}
                as="input"
                className="drawer-input"
                value={row.audience ?? ''}
                placeholder="—"
                onCommit={(audience) => updateRow(row.id, { audience })}
              />
            </label>

            <label className="copy-field">
              <span className="copy-label">Scheduled</span>
              <input
                className="drawer-input"
                type="datetime-local"
                value={isoToLocalInput(row.scheduledAt)}
                onChange={(e) => updateRow(row.id, { scheduledAt: localInputToIso(e.target.value) })}
              />
            </label>

            <label className="copy-field">
              <span className="copy-label">Status</span>
              <select
                className="drawer-input"
                value={row.status}
                onChange={(e) => {
                  const status = e.target.value as RowStatus
                  updateRow(row.id, {
                    status,
                    approvedAt: status === 'approved' ? row.approvedAt ?? Date.now() : row.approvedAt,
                    postedAt: status === 'posted' ? row.postedAt ?? Date.now() : row.postedAt,
                  })
                }}
              >
                {/* All seven, from the shared list. This drawer WRITES in_review and rejected
                    (its own Undo and Send back below), and then offered neither, so the picker
                    could not show you the state you had just put the row into. */}
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          </>
          )}

          {/* ---- Messaging ---- */}
          <div className="drawer-section">
            Messaging
            <span className="spacer" />
            <button
              className="btn ghost sm"
              onClick={() => draftCopy([row.id])}
              disabled={drafting}
              title="Draft starter copy for this asset from the ICP"
            >
              {drafting ? '✦ Drafting…' : '✦ Draft'}
            </button>
          </div>

          {assetFlag && (
            <div className="msg-flag asset-flag">
              <span className="flag-tag">off-ICP</span>
              <div>
                <div className="flag-reason">{assetFlag.issue}</div>
                {assetFlag.suggestion && <div className="flag-suggest">→ {assetFlag.suggestion}</div>}
              </div>
            </div>
          )}

          <CopyFields
            fields={fields}
            values={map}
            setField={setField}
            flagOf={(key) => {
              const f = fieldFlag(key)
              return f ? { issue: f.issue, suggestion: f.suggestion } : undefined
            }}
            renderExtras={(fl, val) =>
              rtbs.length > 0 ? (
                <div className="rtb-row">
                  <span className="rtb-tag-label">Proof</span>
                  {rtbs.map((rtb) => {
                    const on = (row.rtbMap?.[fl.key] ?? []).includes(rtb.id)
                    return (
                      <button
                        key={rtb.id}
                        type="button"
                        className={`rtb-chip${on ? ' on' : ''}`}
                        title={rtb.detail}
                        onClick={() => toggleRtb(fl.key, rtb.id)}
                      >
                        {rtb.label}
                      </button>
                    )
                  })}
                  {val.trim() && (row.rtbMap?.[fl.key] ?? []).length === 0 && (
                    <span className="rtb-warn">unsupported claim</span>
                  )}
                </div>
              ) : null
            }
          />

          {(row.body !== undefined || row.mediaType === 'text') && (
            <label className="copy-field">
              <span className="copy-label">Body</span>
              <BufferedTextarea
                key={row.id}
                className="tall"
                value={row.body ?? ''}
                placeholder="Body copy…"
                onCommit={(body) => updateRow(row.id, { body })}
              />
            </label>
          )}

          {isMedia && (
            <label className="copy-field">
              <span className="copy-label">
                In-creative copy
                <button className="btn ghost sm" onClick={() => extractCopy(row.id)}>
                  ⟳ Extract
                </button>
              </span>
              <BufferedTextarea
                key={row.id}
                className="tall"
                value={row.extractedCopy ?? ''}
                placeholder="Text baked into the creative (overlays, VO, page copy). Click Extract."
                onCommit={(extractedCopy) => updateRow(row.id, { extractedCopy })}
              />
              <span className="copy-hint">
                Image/video text is transcribed via Claude vision when wired (stubbed in v1).
              </span>
            </label>
          )}

          {/* ---- Tracking (collapsed by default) ---- */}
          <div className="drawer-section drawer-sec-toggle" role="button" tabIndex={0} onClick={() => toggleSec('tracking')}>
            <span className="drawer-sec-caret">{openSec.tracking ? '▾' : '▸'}</span>
            Tracking
            {row.utm && (
              <span className={`drawer-pill ${trackingClean ? 'ok' : 'bad'}`}>
                {trackingClean ? '✓ clean' : `⚑ ${checks.filter((c) => !c.ok).length}`}
              </span>
            )}
          </div>
          {openSec.tracking && (
          <>
          <div className="drawer-sec-actions">
            <button className="btn ghost sm" onClick={() => generateTrackingForRow(row.id)}>
              ⟳ Generate
            </button>
          </div>
          <div className="drawer-grid2">
            {UTM_PARTS.map((p) => (
              <label className="copy-field" key={p.key}>
                <span className="copy-label">utm_{p.key}</span>
                <input
                  className="drawer-input"
                  value={row.utm?.[p.key] ?? ''}
                  placeholder="—"
                  onChange={(e) => setUtm(p.key, e.target.value)}
                />
              </label>
            ))}
          </div>
          {row.utm && <code className="drawer-utm">?{utmQuery(row.utm)}</code>}
          </>
          )}

          {/* ---- Budget (paid only, collapsed by default) ---- */}
          {paid && (
            <>
              <div className="drawer-section drawer-sec-toggle" role="button" tabIndex={0} onClick={() => toggleSec('budget')}>
                <span className="drawer-sec-caret">{openSec.budget ? '▾' : '▸'}</span>
                Budget
              </div>
              {openSec.budget && (
              <>
              <div className="drawer-grid2">
                <label className="copy-field">
                  <span className="copy-label">Amount</span>
                  <input
                    className="drawer-input"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={row.budget?.amount || ''}
                    onChange={(e) => setBudget({ amount: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="copy-field">
                  <span className="copy-label">Type</span>
                  <select
                    className="drawer-input"
                    value={row.budget?.type ?? 'daily'}
                    onChange={(e) => setBudget({ type: e.target.value as 'daily' | 'lifetime' })}
                  >
                    <option value="daily">daily</option>
                    <option value="lifetime">lifetime</option>
                  </select>
                </label>
                <label className="copy-field">
                  <span className="copy-label">End date</span>
                  <input
                    className="drawer-input"
                    type="date"
                    value={row.budget?.endDate?.slice(0, 10) ?? ''}
                    onChange={(e) =>
                      setBudget({ endDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })
                    }
                  />
                </label>
              </div>
              {hasBudget(row) && row.spend && (() => {
                const pc = pacing(row, now)
                return (
                  <div className={`drawer-pace pace-${pc.status}`}>
                    Planned {money(pc.planned)} · spent {money(pc.spent)} · {PACE_LABEL[pc.status]}
                  </div>
                )
              })()}
              </>
              )}
            </>
          )}

          <div className="drawer-foot-spacer" />
        </div>

        <div className="drawer-foot">
          {rowBreaks.length > 0 ? (
            <button
              className="copy-break-link"
              onClick={() => openBreaks(rowBreaks[0].id)}
              title="This asset breaks the thread — view the break"
            >
              ⚠ {rowBreaks.length} break{rowBreaks.length === 1 ? '' : 's'} — view
            </button>
          ) : (
            <span className="copy-pieces-count">
              {liveFlags.length > 0
                ? `${liveFlags.length} unresolved ICP flag${liveFlags.length === 1 ? '' : 's'}`
                : '✓ On-message'}
            </span>
          )}
          <span className="spacer" />
          {row.status === 'approved' ? (
            <>
              <span className="copy-approved">✓ Approved</span>
              <button className="btn sm ghost" onClick={() => updateRow(row.id, { status: 'in_review' })}>
                Undo
              </button>
            </>
          ) : (
            <>
              <button className="btn sm" onClick={() => updateRow(row.id, { status: 'rejected' })}>
                Send back
              </button>
              <button
                className="btn green"
                onClick={() =>
                  updateRow(row.id, { status: 'approved', approvedAt: row.approvedAt ?? Date.now(), copyReviewed: true })
                }
              >
                Approve
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  )
}
