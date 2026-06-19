import { KIND_ORDER, channelsByKind } from '../domain/channels'
import { channelTracking } from '../domain/tracking'
import { rowsToCsv, downloadCsv } from '../lib/csv'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

export function Sidebar() {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const setFilter = useTrafficStore((s) => s.setFilter)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const query = useTrafficStore((s) => s.query)
  const clearSheet = useTrafficStore((s) => s.clearSheet)

  // Counts reflect the current client / campaign (and search) scope — NOT the
  // channel filter itself — so each count matches what selecting it actually shows.
  const scopedRows = rows.filter((r) =>
    rowInScope(r, { filter: 'all', query, clientFilter, campaignFilter }),
  )
  const countFor = (id: string) => scopedRows.filter((r) => r.channel === id).length

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <button
          className={`nav-item${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <span className="nav-ico">▦</span>
          <span className="nav-label">All channels</span>
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
