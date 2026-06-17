import { KIND_ORDER, channelsByKind, channelAccepts } from '../domain/channels'
import type { Asset } from '../domain/types'
import { formatBytes } from '../lib/format'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { Thumb } from './Thumb'

function PendingCard({ asset }: { asset: Asset }) {
  const { updateAsset, toggleChannel, removeAsset } = useTrafficStore()

  return (
    <div className="asset">
      <div className="thumb">
        <Thumb mediaType={asset.mediaType} url={asset.previewUrl} />
      </div>
      <div className="meta">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="name" title={asset.name}>
            {asset.name}
          </span>
          <button
            className="btn ghost sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => removeAsset(asset.id)}
          >
            Remove
          </button>
        </div>
        <div className="sub">
          {asset.mediaType}
          {asset.size != null && ` · ${formatBytes(asset.size)}`}
        </div>

        <textarea
          placeholder="Caption / copy for this asset…"
          value={asset.caption}
          onChange={(e) => updateAsset(asset.id, { caption: e.target.value })}
        />

        {KIND_ORDER.map((section) => (
          <div className="chip-group" key={section.kind}>
            <span className="chip-group-label">{section.label}</span>
            <div className="chips">
              {channelsByKind(section.kind).map((c) => {
                const on = asset.channels.includes(c.id)
                const fit = channelAccepts(c.id, asset.mediaType)
                return (
                  <button
                    key={c.id}
                    className={`chip${on ? ' on' : ''}${!fit ? ' warn' : ''}`}
                    style={on ? { background: c.color } : undefined}
                    onClick={() => toggleChannel(asset.id, c.id)}
                    title={fit ? '' : `${asset.mediaType} is an unusual fit for ${c.label}`}
                  >
                    <ChannelIcon channel={c.id} size={13} color={on ? '#fff' : undefined} />
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {asset.channels.length === 0 && (
          <div className="warn-text">Pick at least one channel to traffic this asset.</div>
        )}
      </div>
    </div>
  )
}

export function IngestTray() {
  const assets = useTrafficStore((s) => s.assets)
  const addToSheet = useTrafficStore((s) => s.addToSheet)

  const rowCount = assets.reduce((n, a) => n + a.channels.length, 0)

  if (assets.length === 0) return null

  return (
    <div className="ingest-tray">
      <div className="ingest-tray-head">
        <strong>{assets.length} asset{assets.length === 1 ? '' : 's'} to traffic</strong>
        <span className="hint">Assign channel(s) and copy, then add them to the sheet.</span>
      </div>
      <div className="asset-grid">
        {assets.map((a) => (
          <PendingCard key={a.id} asset={a} />
        ))}
      </div>
      <div className="actionbar">
        <span className="count">
          {rowCount} row{rowCount === 1 ? '' : 's'} will be added
        </span>
        <span className="spacer" />
        <button className="btn primary" disabled={rowCount === 0} onClick={addToSheet}>
          Add to sheet ↓
        </button>
      </div>
    </div>
  )
}
