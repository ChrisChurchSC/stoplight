import { useEffect, useState } from 'react'
import { freshAudienceId } from '../domain/audiences'
import { CHANNEL_LIST, KIND_ORDER, channelsByKind } from '../domain/channels'
import { channelTracking } from '../domain/tracking'
import { rowsToCsv, downloadCsv } from '../lib/csv'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

const initials = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
const webHref = (w: string) => (/^https?:\/\//.test(w) ? w : `https://${w}`)

export function Sidebar() {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const setFilter = useTrafficStore((s) => s.setFilter)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const query = useTrafficStore((s) => s.query)
  const clearSheet = useTrafficStore((s) => s.clearSheet)
  const openTracking = useTrafficStore((s) => s.openTracking)
  const profile = useTrafficStore((s) => s.clientProfiles[clientFilter])
  const icp = useTrafficStore((s) => s.icp)
  const loadIcp = useTrafficStore((s) => s.loadIcp)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const setIcpOpen = useTrafficStore((s) => s.setIcpOpen)

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  // Surface the ICP in the profile card (not behind a button) — pull it if a
  // client is in view and we don't have one yet.
  useEffect(() => {
    if (clientFilter !== 'all' && !icp) loadIcp()
  }, [clientFilter, icp, loadIcp])

  // Audiences (personas under the ICP) live in the profile card. The card lists
  // them and adds new ones; full editing (angle, proof, strategy) opens the ICP
  // drawer where there's room for it.
  const audiences = clientFilter !== 'all' ? clientAudiences[clientFilter] ?? [] : []
  const addAudience = () => {
    const name = newName.trim()
    if (!name) {
      setAdding(false)
      return
    }
    setClientAudiences(clientFilter, [
      ...audiences,
      { id: freshAudienceId(), name, messageAngle: '', rtbEmphasis: [], strategy: '' },
    ])
    setNewName('')
    setAdding(false)
    setIcpOpen(true)
  }

  // Counts reflect the current client / campaign (and search) scope — NOT the
  // channel filter itself — so each count matches what selecting it actually shows.
  const scopedRows = rows.filter((r) =>
    rowInScope(r, { filter: 'all', query, clientFilter, campaignFilter }),
  )
  const countFor = (id: string) => scopedRows.filter((r) => r.channel === id).length

  // Aggregate tracking readiness across every channel, for the "All channels" row.
  const allTracking = CHANNEL_LIST.map((c) => channelTracking(c.id))
  const trReady = allTracking.reduce((n, t) => n + t.ready, 0)
  const trTotal = allTracking.reduce((n, t) => n + t.total, 0)
  const trChannelsNeeding = allTracking.filter((t) => t.ready < t.total).length
  const allTrCls = trReady === trTotal ? 'ok' : trReady === 0 ? 'none' : 'partial'
  const allTrTitle = `Infrastructure ${trReady}/${trTotal} set up across all channels${
    trChannelsNeeding ? ` — ${trChannelsNeeding} channel${trChannelsNeeding === 1 ? '' : 's'} need setup` : ''
  }`

  return (
    <aside className="sidebar">
      <div className="sidebar-client">
        <div className="sidebar-client-head">
          <span className="sidebar-client-avatar">{initials(clientFilter)}</span>
          <div className="sidebar-client-id">
            <div className="sidebar-client-name" title={clientFilter}>
              {clientFilter}
            </div>
            {profile?.industry && <div className="sidebar-client-industry">{profile.industry}</div>}
          </div>
        </div>
        {profile?.website && (
          <a
            className="sidebar-client-web"
            href={webHref(profile.website)}
            target="_blank"
            rel="noreferrer"
          >
            ↗ {profile.website}
          </a>
        )}
        {profile?.voice && <div className="sidebar-client-voice">“{profile.voice}”</div>}

        {icp && (
          <div className="sidebar-icp">
            <div className="sidebar-icp-label">ICP · via Clay</div>
            <div className="sidebar-icp-name">{icp.name}</div>
            {icp.segment && <div className="sidebar-icp-seg">{icp.segment}</div>}
            {icp.pains?.length > 0 && (
              <div className="sidebar-icp-pains">
                {icp.pains.slice(0, 4).map((p) => (
                  <span key={p} className="sidebar-icp-pain">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {clientFilter !== 'all' && (
          <div className="sidebar-aud">
            <div className="sidebar-aud-label">
              Audiences
              {audiences.length > 0 && <span className="sidebar-aud-count">{audiences.length}</span>}
            </div>
            {audiences.length > 0 && (
              <div className="sidebar-aud-list">
                {audiences.map((a) => (
                  <button
                    key={a.id}
                    className="sidebar-aud-chip"
                    title={a.messageAngle || 'Edit audience in ICP drawer'}
                    onClick={() => setIcpOpen(true)}
                  >
                    {a.name || 'Untitled audience'}
                  </button>
                ))}
              </div>
            )}
            {adding ? (
              <input
                className="sidebar-aud-input"
                autoFocus
                value={newName}
                placeholder="Audience name"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addAudience()
                  if (e.key === 'Escape') {
                    setNewName('')
                    setAdding(false)
                  }
                }}
                onBlur={addAudience}
              />
            ) : (
              <button className="sidebar-aud-add" onClick={() => setAdding(true)}>
                ＋ Add audience
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <span className="nav-ico">▦</span>
          <span className="nav-label">All channels</span>
          <span
            className="nav-track"
            role="button"
            tabIndex={0}
            title={`${allTrTitle} — click for detail`}
            onClick={(e) => {
              e.stopPropagation()
              openTracking('all')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                openTracking('all')
              }
            }}
          >
            <span className={`nav-track-dot ${allTrCls}`} />
          </span>
          <span className="nav-count">{scopedRows.length}</span>
        </button>

        {KIND_ORDER.map((section) => (
          <div key={section.kind}>
            <div className="nav-section">{section.label}</div>
            {channelsByKind(section.kind).map((c) => {
              const tr = channelTracking(c.id)
              const missing = tr.items.filter((x) => !x.installed).map((x) => x.item.label)
              const trCls = tr.ready === tr.total ? 'ok' : tr.ready === 0 ? 'none' : 'partial'
              return (
                <button
                  key={c.id}
                  className={`nav-item${filter === c.id ? ' active' : ''}`}
                  onClick={() => setFilter(c.id)}
                >
                  <span className="nav-logo">
                    <ChannelIcon channel={c.id} size={15} />
                  </span>
                  <span className="nav-label">{c.label}</span>
                  <span
                    className="nav-track"
                    role="button"
                    tabIndex={0}
                    title={`Infrastructure ${tr.ready}/${tr.total} set up${missing.length ? ` — needs ${missing.join(', ')}` : ''} — click for detail`}
                    onClick={(e) => {
                      e.stopPropagation()
                      openTracking(c.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        openTracking(c.id)
                      }
                    }}
                  >
                    <span className={`nav-track-dot ${trCls}`} />
                  </span>
                  <span className="nav-count">{countFor(c.id)}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button
          className="nav-item"
          disabled={rows.length === 0}
          onClick={() => downloadCsv('rushhour-sheet.csv', rowsToCsv(rows))}
        >
          <span className="nav-ico">⤓</span>
          <span className="nav-label">Export CSV</span>
        </button>
        <button className="nav-item" disabled={rows.length === 0} onClick={clearSheet}>
          <span className="nav-ico">🗑</span>
          <span className="nav-label">Clear sheet</span>
        </button>
      </div>
    </aside>
  )
}
