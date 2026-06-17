import { KIND_ORDER, channelsByKind } from '../domain/channels'
import { rowsToCsv, downloadCsv } from '../lib/csv'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

export function Sidebar() {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const setFilter = useTrafficStore((s) => s.setFilter)
  const clearSheet = useTrafficStore((s) => s.clearSheet)

  const countFor = (id: string) => rows.filter((r) => r.channel === id).length

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="logo">
          <span className="r" />
          <span className="a" />
          <span className="g" />
        </div>
        <span className="sidebar-brand-name">Rushhour</span>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <span className="nav-ico">▦</span>
          <span className="nav-label">All channels</span>
          <span className="nav-count">{rows.length}</span>
        </button>

        {KIND_ORDER.map((section) => (
          <div key={section.kind}>
            <div className="nav-section">{section.label}</div>
            {channelsByKind(section.kind).map((c) => (
              <button
                key={c.id}
                className={`nav-item${filter === c.id ? ' active' : ''}`}
                onClick={() => setFilter(c.id)}
              >
                <span className="nav-logo">
                  <ChannelIcon channel={c.id} size={15} />
                </span>
                <span className="nav-label">{c.label}</span>
                <span className="nav-count">{countFor(c.id)}</span>
              </button>
            ))}
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
