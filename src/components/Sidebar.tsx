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
  const profile = useTrafficStore((s) => s.clientProfiles[clientFilter])

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
  const allTrTitle = `Tracking ${trReady}/${trTotal} set up across all channels${
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
            className="sidebar-client-row sidebar-client-web"
            href={webHref(profile.website)}
            target="_blank"
            rel="noreferrer"
          >
            ↗ {profile.website}
          </a>
        )}
        {profile?.voice && <div className="sidebar-client-voice">“{profile.voice}”</div>}
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <span className="nav-ico">▦</span>
          <span className="nav-label">All channels</span>
          <span className={`nav-track ${allTrCls}`} title={allTrTitle} />
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
                    className={`nav-track ${trCls}`}
                    title={`Tracking ${tr.ready}/${tr.total} set up${missing.length ? ` — needs ${missing.join(', ')}` : ''}`}
                  />
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
