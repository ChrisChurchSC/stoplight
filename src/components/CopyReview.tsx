import { CHANNELS } from '../domain/channels'
import { typeLabel } from '../domain/channelAssetTypes'
import { copyPieces } from '../adapters/copy/extract'
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

  const row = rows.find((r) => r.id === reviewRowId)
  if (!row) return null

  const pieces = copyPieces(row)
  const isMedia = row.mediaType === 'image' || row.mediaType === 'video' || row.mediaType === 'link'

  return (
    <>
      <div className="drawer-scrim" onClick={() => openReview(null)} />
      <aside className="drawer">
        <div className="drawer-head">
          <strong>Review copy</strong>
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
          {/* Caption */}
          <label className="copy-field">
            <span className="copy-label">
              Caption
              <span className="copy-count">{row.caption.length} chars</span>
            </span>
            <textarea
              value={row.caption}
              placeholder="Caption / post copy…"
              onChange={(e) => updateRow(row.id, { caption: e.target.value })}
            />
          </label>

          {/* Body (text assets / landing copy) */}
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

          {/* In-creative copy (OCR / VO / page) */}
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
          <span className="copy-pieces-count">{pieces.length} copy block{pieces.length === 1 ? '' : 's'}</span>
          <span className="spacer" />
          <button
            className={`btn ${row.copyReviewed ? '' : 'green'}`}
            onClick={() => toggleReviewed(row.id, !row.copyReviewed)}
          >
            {row.copyReviewed ? '✓ Reviewed — undo' : 'Mark copy reviewed'}
          </button>
        </div>
      </aside>
    </>
  )
}
