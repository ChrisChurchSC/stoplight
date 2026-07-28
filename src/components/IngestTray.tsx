import { useState } from 'react'
import { KIND_ORDER, channelsByKind, channelAccepts, CHANNEL_LIST, CHANNELS } from '../domain/channels'
import { typesFor } from '../domain/channelAssetTypes'
import type { Asset, ChannelId } from '../domain/types'
import { formatBytes } from '../lib/format'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { Thumb } from './Thumb'

type Band = 'high' | 'medium' | 'low' | 'none'

function band(a: Asset): Band {
  if (a.channels.length === 0) return 'none'
  const c = a.classifyConfidence ?? 0
  if (c >= 0.85) return 'high'
  if (c >= 0.6) return 'medium'
  return 'low'
}

/** Assets that still want a human: no channel, low confidence, or a channel that
 *  doesn't actually accept this media. These float to the top of the board. */
function needsLook(a: Asset): boolean {
  const b = band(a)
  return b === 'none' || b === 'low' || a.channels.some((ch) => !channelAccepts(ch, a.mediaType))
}

const SOURCE_LABEL: Record<NonNullable<Asset['classifySource']>, string> = {
  path: 'Folder & name',
  heuristic: 'Aspect ratio',
  ai: 'Claude',
}

const BAND_LABEL: Record<Band, string> = {
  high: 'Auto-organized',
  medium: 'Best guess',
  low: 'Low confidence',
  none: 'Needs a channel',
}

function dimsLabel(a: Asset): string | null {
  if (!a.width || !a.height) return null
  const ar = `${a.width}×${a.height}`
  if (a.durationSec) return `${ar} · ${Math.round(a.durationSec)}s`
  return ar
}

function PendingCard({ asset, audienceNames }: { asset: Asset; audienceNames: string[] }) {
  const { updateAsset, toggleChannel, removeAsset } = useTrafficStore()
  const b = band(asset)
  // Local so picking the first channel doesn't snap the panel shut mid-interaction.
  const [addOpen, setAddOpen] = useState(asset.channels.length === 0)

  const setType = (channel: ChannelId, value: string) =>
    updateAsset(asset.id, { suggestedTypeFor: { ...asset.suggestedTypeFor, [channel]: value } })

  return (
    <div className={`asset${needsLook(asset) ? ' asset--attention' : ''}`}>
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
          {dimsLabel(asset) && ` · ${dimsLabel(asset)}`}
        </div>

        <div className="cpf-badges">
          <span className={`cpf-badge cpf-badge--${b}`}>{BAND_LABEL[b]}</span>
          {asset.classifySource && asset.channels.length > 0 && (
            <span className="cpf-src">from {SOURCE_LABEL[asset.classifySource]}</span>
          )}
        </div>

        <textarea
          placeholder="Caption / copy for this asset…"
          value={asset.caption}
          onChange={(e) => updateAsset(asset.id, { caption: e.target.value })}
        />

        {/* Audience = the lane this asset lands in on the canvas. Pre-filled when
            the folder name matched a defined audience; type to override, with the
            brand's audiences as suggestions. */}
        <input
          className={`cpf-aud${(asset.audience ?? '').trim() ? '' : ' cpf-aud--empty'}`}
          list={`aud-${asset.id}`}
          placeholder="Audience (canvas lane)…"
          value={asset.audience ?? ''}
          onChange={(e) => updateAsset(asset.id, { audience: e.target.value })}
        />
        {audienceNames.length > 0 && (
          <datalist id={`aud-${asset.id}`}>
            {audienceNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        )}

        {/* Confirm channel + type for everything already chosen. */}
        {asset.channels.length > 0 && (
          <div className="cpf-sel">
            {asset.channels.map((ch) => {
              const c = CHANNELS[ch]
              const fit = channelAccepts(ch, asset.mediaType)
              return (
                <div className="cpf-sel-row" key={ch}>
                  <button
                    className="chip on cpf-sel-chip"
                    style={{ background: c.color }}
                    onClick={() => toggleChannel(asset.id, ch)}
                    title="Remove this channel"
                  >
                    <ChannelIcon channel={ch} size={13} color="#fff" />
                    {c.label}
                    <span className="cpf-sel-x">×</span>
                  </button>
                  <select
                    className={`cpf-type${!fit ? ' cpf-type--warn' : ''}`}
                    value={asset.suggestedTypeFor?.[ch] ?? ''}
                    onChange={(e) => setType(ch, e.target.value)}
                    title={fit ? '' : `${asset.mediaType} is an unusual fit for ${c.label}`}
                  >
                    {typesFor(ch).map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        )}

        {/* Add or change channels. */}
        <details
          className="cpf-add"
          open={addOpen}
          onToggle={(e) => setAddOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>{asset.channels.length === 0 ? 'Pick a channel' : 'Add or change channels'}</summary>
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
        </details>

        {asset.channels.length === 0 && (
          <div className="warn-text">Pick at least one channel to traffic this asset.</div>
        )}
      </div>
    </div>
  )
}

/** Bulk "treat this whole folder as channel X" — the highest-leverage fix when a
 *  Drive folder maps cleanly to one channel. Ephemeral (no saved routing table). */
function FolderBar({ folder, ids, audienceNames }: { folder: string; ids: string[]; audienceNames: string[] }) {
  const updateAsset = useTrafficStore((s) => s.updateAsset)
  return (
    <div className="cpf-folder">
      <span className="cpf-folder-name" title={folder}>
        {folder}
      </span>
      <span className="cpf-folder-count">{ids.length} asset{ids.length === 1 ? '' : 's'}</span>
      <select
        className="cpf-cascade"
        value=""
        onChange={(e) => {
          const ch = e.target.value as ChannelId
          if (ch) for (const id of ids) updateAsset(id, { channels: [ch] })
        }}
      >
        <option value="">Set channel for all…</option>
        {CHANNEL_LIST.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      {audienceNames.length > 0 && (
        <select
          className="cpf-cascade"
          value=""
          onChange={(e) => {
            const aud = e.target.value
            if (aud) for (const id of ids) updateAsset(id, { audience: aud })
          }}
        >
          <option value="">Audience for all…</option>
          {audienceNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export function IngestTray() {
  const assets = useTrafficStore((s) => s.assets)
  const addToSheet = useTrafficStore((s) => s.addToSheet)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const audienceNames = (clientAudiences[clientFilter] ?? []).map((a) => a.name)

  if (assets.length === 0) return null

  const rowCount = assets.reduce((n, a) => n + a.channels.length, 0)
  const attention = assets.filter(needsLook).length
  const organized = assets.length - attention

  // Group by source folder (Drive); local drops share one empty-key group.
  const groupMap = new Map<string, Asset[]>()
  for (const a of assets) {
    const key = a.folderPath ?? ''
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(a)
  }
  // Within each group, float the assets that need attention to the top.
  const order = (a: Asset, b: Asset) => Number(needsLook(b)) - Number(needsLook(a))
  const groups = [...groupMap.entries()].map(([folder, list]) => ({
    folder,
    list: [...list].sort(order),
  }))

  return (
    <div className="ingest-tray">
      <div className="ingest-tray-head">
        <strong>{assets.length} asset{assets.length === 1 ? '' : 's'} to traffic</strong>
        <span className="hint">
          Auto-organized {organized} of {assets.length}
          {attention > 0 && ` · ${attention} need a look`}. Confirm channel + type, then add to the sheet.
        </span>
      </div>

      {groups.map(({ folder, list }) => (
        <div className="cpf-group" key={folder || '_local'}>
          {folder && <FolderBar folder={folder} ids={list.map((a) => a.id)} audienceNames={audienceNames} />}
          <div className="asset-grid">
            {list.map((a) => (
              <PendingCard key={a.id} asset={a} audienceNames={audienceNames} />
            ))}
          </div>
        </div>
      ))}

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
