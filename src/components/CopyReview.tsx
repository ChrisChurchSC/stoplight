import { CHANNELS, KIND_ORDER, channelsByKind } from '../domain/channels'
import { isValidType, typeLabel, typesFor } from '../domain/channelAssetTypes'
import { messagingFields, messagingMap } from '../domain/messaging'
import { rtbsForCampaign } from '../domain/rtb'
import { isTrackingClean, trackingChecks, utmQuery, type Utm } from '../domain/tracking'
import { PACE_LABEL, hasBudget, isPaidRow, money, pacing } from '../domain/budget'
import { isoToLocalInput, localInputToIso } from '../lib/format'
import { flagResolved } from '../adapters/icp/mockIcp'
import type { ChannelId, RowStatus } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { ChannelPreview } from './ChannelPreview'
import { Thumb } from './Thumb'

const STATUSES: RowStatus[] = ['draft', 'approved', 'scheduled', 'posted', 'failed']
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
  const toggleReviewed = useTrafficStore((s) => s.toggleReviewed)
  const generateTrackingForRow = useTrafficStore((s) => s.generateTrackingForRow)
  const batchReview = useTrafficStore((s) => s.batchReview)
  const icp = useTrafficStore((s) => s.icp)
  const draftCopy = useTrafficStore((s) => s.draftCopy)
  const drafting = useTrafficStore((s) => s.drafting)
  const fillRowMedia = useTrafficStore((s) => s.fillRowMedia)

  const row = rows.find((r) => r.id === reviewRowId)
  if (!row) return null

  const fields = messagingFields(row.channel, row.assetType)
  const map = messagingMap(row)
  const pains = icp?.pains ?? []
  const isMedia = row.mediaType === 'image' || row.mediaType === 'video' || row.mediaType === 'link'
  const typeValid = isValidType(row.channel, row.assetType)
  const paid = isPaidRow(row)
  const now = Date.now()

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
              <Thumb mediaType={row.mediaType} url={row.mediaRef} />
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
          {/* ---- Preview ---- */}
          <div className="drawer-section">
            Preview
            <span className="drawer-section-note">{CHANNELS[row.channel].label} · {typeLabel(row.channel, row.assetType) || 'asset'}</span>
          </div>
          <ChannelPreview row={row} />

          {/* ---- Details ---- */}
          <div className="drawer-section">Details</div>

          <label className="copy-field">
            <span className="copy-label">Asset name</span>
            <input
              className="drawer-input"
              value={row.assetName}
              onChange={(e) => updateRow(row.id, { assetName: e.target.value })}
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
              <input
                className="drawer-input"
                value={row.campaign ?? ''}
                placeholder="—"
                onChange={(e) => updateRow(row.id, { campaign: e.target.value })}
              />
            </label>

            <label className="copy-field">
              <span className="copy-label">Audience</span>
              <input
                className="drawer-input"
                value={row.audience ?? ''}
                placeholder="—"
                onChange={(e) => updateRow(row.id, { audience: e.target.value })}
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
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

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

          {fields.map((fl) => {
            const val = map[fl.key] ?? ''
            const flag = fieldFlag(fl.key)
            const over = fl.hardLimit ? val.length > fl.hardLimit : false
            return (
              <label className={`copy-field${flag ? ' flagged' : ''}`} key={fl.key}>
                <span className="copy-label">
                  {fl.label}
                  <span className={`copy-count${over ? ' over' : ''}`}>
                    {val.length}
                    {fl.hardLimit ? `/${fl.hardLimit}` : ''}
                  </span>
                </span>
                <textarea
                  className={fl.multiline ? 'tall' : ''}
                  value={val}
                  placeholder={`${fl.label}…`}
                  onChange={(e) => setField(fl.key, e.target.value)}
                />
                {flag && (
                  <div className="msg-flag">
                    <span className="flag-tag">drift</span>
                    <div>
                      <div className="flag-reason">{flag.issue}</div>
                      {flag.suggestion && <div className="flag-suggest">→ {flag.suggestion}</div>}
                    </div>
                  </div>
                )}
                {rtbs.length > 0 && (
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
                )}
              </label>
            )
          })}

          {(row.body !== undefined || row.mediaType === 'text') && (
            <label className="copy-field">
              <span className="copy-label">Body</span>
              <textarea
                className="tall"
                value={row.body ?? ''}
                placeholder="Body copy…"
                onChange={(e) => updateRow(row.id, { body: e.target.value })}
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
              <textarea
                className="tall"
                value={row.extractedCopy ?? ''}
                placeholder="Text baked into the creative (overlays, VO, page copy). Click Extract."
                onChange={(e) => updateRow(row.id, { extractedCopy: e.target.value })}
              />
              <span className="copy-hint">
                Image/video text is transcribed via Claude vision when wired (stubbed in v1).
              </span>
            </label>
          )}

          {/* ---- Tracking ---- */}
          <div className="drawer-section">
            Tracking
            {row.utm && (
              <span className={`drawer-pill ${trackingClean ? 'ok' : 'bad'}`}>
                {trackingClean ? '✓ clean' : `⚑ ${checks.filter((c) => !c.ok).length}`}
              </span>
            )}
            <span className="spacer" />
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

          {/* ---- Budget (paid only) ---- */}
          {paid && (
            <>
              <div className="drawer-section">Budget</div>
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

          <div className="drawer-foot-spacer" />
        </div>

        <div className="drawer-foot">
          <span className="copy-pieces-count">
            {liveFlags.length > 0
              ? `${liveFlags.length} unresolved ICP flag${liveFlags.length === 1 ? '' : 's'}`
              : '✓ On-message'}
          </span>
          <span className="spacer" />
          <button
            className={`btn ${row.copyReviewed ? '' : 'green'}`}
            onClick={() => toggleReviewed(row.id, !row.copyReviewed)}
          >
            {row.copyReviewed ? '✓ Reviewed — undo' : 'Mark reviewed'}
          </button>
        </div>
      </aside>
    </>
  )
}
