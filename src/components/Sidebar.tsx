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
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <g transform="translate(2,-1) scale(0.42)" fill="#e5484d">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
            </g>
            <g transform="translate(11,7) scale(0.42)" fill="#f5a623">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
            </g>
            <g transform="translate(2,15) scale(0.42)" fill="#30a46c">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
            </g>
          </svg>
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
