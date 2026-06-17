import { useTrafficStore } from '../store/useTrafficStore'

const CAR =
  'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z'

const PAGES = [
  { key: 'clients', label: 'Clients', icon: '◳' },
  { key: 'calendar', label: 'Calendar', icon: '◷' },
  { key: 'insights', label: 'Insights', icon: '◧' },
  { key: 'assets', label: 'Assets', icon: '▦' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
] as const

export function GlobalNav() {
  const page = useTrafficStore((s) => s.page)
  const setPage = useTrafficStore((s) => s.setPage)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)

  const go = (key: (typeof PAGES)[number]['key']) => {
    setPage(key)
    // Returning to Clients lands on the portfolio overview.
    if (key === 'clients') setClientFilter('all')
  }

  return (
    <nav className="global-nav">
      <div className="global-brand">
        <div className="logo">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff" aria-hidden="true">
            <path d={CAR} />
          </svg>
        </div>
        <span className="global-brand-name">Rushhour</span>
      </div>

      <div className="global-nav-items">
        {PAGES.map((p) => (
          <button
            key={p.key}
            className={`global-nav-item${page === p.key ? ' active' : ''}`}
            onClick={() => go(p.key)}
          >
            <span className="global-nav-ico">{p.icon}</span>
            <span className="global-nav-label">{p.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
