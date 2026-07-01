import { useState } from 'react'
import { can } from '../domain/access'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The app's left sidebar for the files-browser shell — the same panel on the home
 * AND on the Library / Connectors / Billing pages, so the layout never changes
 * between them. A Files nav (all / drafts / flagged / live), the Brands list, and
 * the Library / Connectors / Billing destinations at the foot. Self-contained: it
 * reads counts + brands from the shared hook and drives navigation via the store.
 */

const FILE_FILTERS: { key: string; ico: string; label: string }[] = [
  { key: 'all', ico: '▦', label: 'All canvases' },
  { key: 'drafts', ico: '✎', label: 'Drafts' },
  { key: 'flagged', ico: '⚠', label: 'Flagged' },
  { key: 'live', ico: '●', label: 'Live' },
]

export function HomeSidebar() {
  const { counts, brands } = useHomeCanvases()
  const page = useTrafficStore((s) => s.page)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const homeFilter = useTrafficStore((s) => s.homeFilter)
  const setHomeFilter = useTrafficStore((s) => s.setHomeFilter)
  const setPage = useTrafficStore((s) => s.setPage)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const openOnboard = useTrafficStore((s) => s.openOnboard)
  const deleteClient = useTrafficStore((s) => s.deleteClient)
  const role = useTrafficStore((s) => s.role)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // On the gallery when we're at the clients overview (page=clients, no client scoped).
  const onGallery = page === 'clients' && clientFilter === 'all'
  // Picking a files filter / brand always lands on the gallery, filtered.
  const go = (filter: string) => {
    setHomeFilter(filter)
    setClientFilter('all')
    setPage('clients')
  }

  return (
    <aside className="sidebar home-sidebar">
      <div className="sidebar-logo">HyperFocus</div>

      <nav className="sidebar-nav">
        <div className="nav-section">Files</div>
        {FILE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`nav-item${onGallery && homeFilter === f.key ? ' active' : ''}`}
            onClick={() => go(f.key)}
          >
            <span className="nav-ico">{f.ico}</span>
            <span className="nav-label">{f.label}</span>
            {counts[f.key] > 0 && <span className="nav-count">{counts[f.key]}</span>}
          </button>
        ))}

        <div className="nav-section home-sb-brands-head">
          <span>Brands</span>
          <button className="home-sb-add" title="Add a brand" onClick={openOnboard}>
            ＋
          </button>
        </div>
        {brands.length === 0 && <div className="home-sb-empty">No brands yet</div>}
        {brands.map((b) => {
          const key = `brand:${b.name}`
          return (
            <div key={b.name} className={`nav-item home-sb-brand${onGallery && homeFilter === key ? ' active' : ''}`}>
              <button className="home-sb-brand-main" onClick={() => go(key)} title={`Show ${b.name}'s canvases`}>
                <span className="nav-ico">▤</span>
                <span className="nav-label">{b.name}</span>
                <span className="nav-count">{b.count}</span>
              </button>
              <button
                className="home-sb-del"
                title={`Delete ${b.name}`}
                aria-label={`Delete ${b.name}`}
                onClick={() => setConfirmDelete(b.name)}
              >
                ✕
              </button>
            </div>
          )
        })}
      </nav>

      <div className="sidebar-foot">
        <button className={`nav-item${page === 'library' ? ' active' : ''}`} onClick={() => setPage('library')} title="Messaging systems">
          <span className="nav-ico">▤</span>
          <span className="nav-label">Messaging</span>
        </button>
        {role === 'owner' && (
          <button className={`nav-item${page === 'connectors' ? ' active' : ''}`} onClick={() => setPage('connectors')} title="Connectors">
            <span className="nav-ico">⇄</span>
            <span className="nav-label">Connectors</span>
          </button>
        )}
        {can(role, 'billing') && (
          <button className={`nav-item${page === 'billing' ? ' active' : ''}`} onClick={() => setPage('billing')} title="Billing">
            <span className="nav-ico">◫</span>
            <span className="nav-label">Billing</span>
          </button>
        )}
      </div>

      {confirmDelete && (
        <>
          <div className="drawer-scrim" onClick={() => setConfirmDelete(null)} />
          <div className="confirm-modal" role="dialog" aria-label="Delete brand">
            <strong className="confirm-title">Delete {confirmDelete}?</strong>
            <p className="confirm-text">This removes the brand and its canvases. This can't be undone.</p>
            <div className="confirm-foot">
              <button className="btn sm" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <span className="spacer" />
              <button
                className="btn sm danger"
                onClick={() => {
                  const name = confirmDelete
                  if (homeFilter === `brand:${name}`) setHomeFilter('all')
                  void deleteClient(name)
                  setConfirmDelete(null)
                }}
              >
                Delete brand
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
