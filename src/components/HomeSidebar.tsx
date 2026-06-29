import { can } from '../domain/access'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The home's files sidebar — the same left panel the canvas carries, but for
 * browsing canvases instead of channels: a Files nav (all / drafts / flagged /
 * live), the Brands list (filter to one), and the Library / owner destinations at
 * the foot. Picking a filter narrows the gallery; the 56px global rail hides on
 * the home so this is the single sidebar, matching the canvas shell.
 */

export interface BrandRow {
  name: string
  count: number
}

const FILE_FILTERS: { key: string; ico: string; label: string }[] = [
  { key: 'all', ico: '▦', label: 'All canvases' },
  { key: 'drafts', ico: '✎', label: 'Drafts' },
  { key: 'flagged', ico: '⚠', label: 'Flagged' },
  { key: 'live', ico: '●', label: 'Live' },
]

export function HomeSidebar({
  filter,
  setFilter,
  counts,
  brands,
  onAddBrand,
  onDeleteBrand,
}: {
  filter: string
  setFilter: (f: string) => void
  counts: Record<string, number>
  brands: BrandRow[]
  onAddBrand: () => void
  onDeleteBrand: (name: string) => void
}) {
  const setPage = useTrafficStore((s) => s.setPage)
  const role = useTrafficStore((s) => s.role)

  return (
    <aside className="sidebar home-sidebar">
      <div className="sidebar-logo">HyperFocus</div>

      <nav className="sidebar-nav">
        <div className="nav-section">Files</div>
        {FILE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`nav-item${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            <span className="nav-ico">{f.ico}</span>
            <span className="nav-label">{f.label}</span>
            {counts[f.key] > 0 && <span className="nav-count">{counts[f.key]}</span>}
          </button>
        ))}

        <div className="nav-section home-sb-brands-head">
          <span>Brands</span>
          <button className="home-sb-add" title="Add a brand" onClick={onAddBrand}>
            ＋
          </button>
        </div>
        {brands.length === 0 && <div className="home-sb-empty">No brands yet</div>}
        {brands.map((b) => {
          const key = `brand:${b.name}`
          return (
            <div key={b.name} className={`nav-item home-sb-brand${filter === key ? ' active' : ''}`}>
              <button className="home-sb-brand-main" onClick={() => setFilter(key)} title={`Show ${b.name}'s canvases`}>
                <span className="nav-ico">▤</span>
                <span className="nav-label">{b.name}</span>
                <span className="nav-count">{b.count}</span>
              </button>
              <button
                className="home-sb-del"
                title={`Delete ${b.name}`}
                aria-label={`Delete ${b.name}`}
                onClick={() => onDeleteBrand(b.name)}
              >
                ✕
              </button>
            </div>
          )
        })}
      </nav>

      <div className="sidebar-foot">
        <button className="nav-item" onClick={() => setPage('library')} title="Messaging Library">
          <span className="nav-ico">▤</span>
          <span className="nav-label">Library</span>
        </button>
        {role === 'owner' && (
          <button className="nav-item" onClick={() => setPage('connectors')} title="Connectors">
            <span className="nav-ico">⇄</span>
            <span className="nav-label">Connectors</span>
          </button>
        )}
        {can(role, 'billing') && (
          <button className="nav-item" onClick={() => setPage('billing')} title="Billing">
            <span className="nav-ico">◫</span>
            <span className="nav-label">Billing</span>
          </button>
        )}
      </div>
    </aside>
  )
}
