import { CHANNELS } from '../domain/channels'
import { typeLabel } from '../domain/channelAssetTypes'
import { messagingFields, messagingMap } from '../domain/messaging'
import { rtbsForCampaign } from '../domain/rtb'
import { flagResolved } from '../adapters/icp/mockIcp'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { Thumb } from './Thumb'

export function CopyReview() {
  const reviewRowId = useTrafficStore((s) => s.reviewRowId)
  const rows = useTrafficStore((s) => s.rows)
  const openReview = useTrafficStore((s) => s.openReview)
  const updateRow = useTrafficStore((s) => s.updateRow)
  const extractCopy = useTrafficStore((s) => s.extractCopy)
  const toggleReviewed = useTrafficStore((s) => s.toggleReviewed)
  const batchReview = useTrafficStore((s) => s.batchReview)
  const icp = useTrafficStore((s) => s.icp)

  const row = rows.find((r) => r.id === reviewRowId)
  if (!row) return null

  const fields = messagingFields(row.channel, row.assetType)
  const map = messagingMap(row)
  const pains = icp?.pains ?? []
  const isMedia = row.mediaType === 'image' || row.mediaType === 'video' || row.mediaType === 'link'

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

  return (
    <>
      <div className="drawer-scrim" onClick={() => openReview(null)} />
      <aside className="drawer">
        <div className="drawer-head">
          <strong>Messaging</strong>
          {liveFlags.length > 0 && <span className="drawer-flagcount">⚑ {liveFlags.length}</span>}
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => openReview(null)}>
            ✕
          </button>
        </div>

        <div className="drawer-asset">
          <div className="drawer-thumb">
            <Thumb mediaType={row.mediaType} url={row.mediaRef} />
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
