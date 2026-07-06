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

export function HomeSidebar() {
  const { brands } = useHomeCanvases()
  const page = useTrafficStore((s) => s.page)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const homeFilter = useTrafficStore((s) => s.homeFilter)
  const setHomeFilter = useTrafficStore((s) => s.setHomeFilter)
  const setPage = useTrafficStore((s) => s.setPage)
  const libraryMode = useTrafficStore((s) => s.libraryMode)
  const setLibraryMode = useTrafficStore((s) => s.setLibraryMode)
  const brandTab = useTrafficStore((s) => s.brandTab)
  const setBrandTab = useTrafficStore((s) => s.setBrandTab)
  const campaignFolders = useTrafficStore((s) => s.campaignFolders)
  const campaignFolderView = useTrafficStore((s) => s.campaignFolderView)
  const setCampaignFolderView = useTrafficStore((s) => s.setCampaignFolderView)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const deleteClient = useTrafficStore((s) => s.deleteClient)
  const role = useTrafficStore((s) => s.role)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // On the gallery when we're at the clients overview (page=clients, no client scoped).
  const onGallery = page === 'clients' && clientFilter === 'all'
  // Brand / Metrics / Library / Channels are brand-scoped destinations: the Brands list
  // picks which brand they show, so a brand click keeps you on the page, not leaves it.
  const brandCtx = page === 'content' || page === 'channels' || page === 'brand' || page === 'reports'
  const go = (filter: string) => {
    setHomeFilter(filter)
    setClientFilter('all')
    if (!brandCtx || filter === 'all' || filter === 'drafts') setPage('clients')
  }

  // A brand's campaign folders, nested under its Campaigns entry. Only shown while that
  // brand's gallery is open; each item scopes the gallery to a folder (All / … / Unfiled).
  const campaignFolderNav = (brand: string) => {
    const folders = campaignFolders[brand] ?? []
    if (!folders.length) return null
    const onThisGallery = page === 'clients' && homeFilter === `brand:${brand}`
    if (!onThisGallery) return null
    const items: [string | null, string][] = [[null, 'All'], ...folders.map((f) => [f, f] as [string, string]), ['', 'Unfiled']]
    const pick = (val: string | null) => {
      setHomeFilter(`brand:${brand}`)
      setClientFilter('all')
      setCampaignFolderView(val)
      setPage('clients')
    }
    return (
      <div className="nav-sub">
        {items.map(([val, label]) => (
          <button key={label} className={`nav-subitem${campaignFolderView === val ? ' active' : ''}`} onClick={() => pick(val)}>
            {label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <aside className="sidebar home-sidebar">
      <div className="sidebar-logo">HyperFocus</div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item${page === 'portfolio' ? ' active' : ''}`}
          onClick={() => setPage('portfolio')}
          title="Overview — what needs attention and what's due next across every campaign"
        >
          <span className="nav-ico">◎</span>
          <span className="nav-label">Overview</span>
        </button>
        <button
          className={`nav-item${page === 'brand' ? ' active' : ''}`}
          onClick={() => setPage('brand')}
          title="Brand — the brand's About, Voice, and Messaging system"
        >
          <span className="nav-ico">◈</span>
          <span className="nav-label">Brand</span>
        </button>
        {page === 'brand' && (
          <div className="nav-sub">
            {(
              [
                ['about', 'About'],
                ['goal', 'Goal'],
                ['voice', 'Voice'],
                ['audiences', 'Audiences'],
                ['strategy', 'Strategy'],
                ['messaging', 'Messaging'],
                ['channels', 'Channels'],
                ['landscape', 'Landscape'],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                className={`nav-subitem${brandTab === t ? ' active' : ''}`}
                onClick={() => setBrandTab(t)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          className={`nav-item${page === 'content' ? ' active' : ''}`}
          onClick={() => setPage('content')}
          title="Library — every published post, video, and page a brand has shipped"
        >
          <span className="nav-ico">❏</span>
          <span className="nav-label">Library</span>
        </button>
        {page === 'content' && (
          <div className="nav-sub">
            {(
              [
                ['catalog', 'Catalog'],
                ['signals', 'Signals'],
                ['keywords', 'Keywords'],
                ['aeo', 'AEO'],
                ['map', 'Map'],
                ['data', 'Data'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                className={`nav-subitem${libraryMode === m ? ' active' : ''}`}
                onClick={() => setLibraryMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          className={`nav-item${page === 'reports' ? ' active' : ''}`}
          onClick={() => setPage('reports')}
          title="Reports — saved Claude write-ups over the brand's library"
        >
          <span className="nav-ico">◳</span>
          <span className="nav-label">Reports</span>
        </button>

        {brands.length === 1 ? (
          // One brand: a single clean "Campaigns" destination (its canvases). Lit only
          // on that gallery, not on the brand-scoped pages (Brand/Metrics/Library/…),
          // so it doesn't stay highlighted alongside the tab you actually opened.
          <>
            <button
              className={`nav-item${onGallery && homeFilter === `brand:${brands[0].name}` ? ' active' : ''}`}
              onClick={() => {
                setHomeFilter(`brand:${brands[0].name}`)
                setClientFilter('all')
                setPage('clients')
              }}
              title={`${brands[0].name}'s campaigns`}
            >
              <span className="nav-ico">▤</span>
              <span className="nav-label">Campaigns</span>
              <span className="nav-count">{brands[0].count}</span>
            </button>
            {campaignFolderNav(brands[0].name)}
          </>
        ) : (
          <>
            <div className="nav-section">Campaigns</div>
            {brands.map((b) => {
              const key = `brand:${b.name}`
              return (
                <div key={b.name}>
                  <div className={`nav-item home-sb-brand${(onGallery || brandCtx) && homeFilter === key ? ' active' : ''}`}>
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
                  {campaignFolderNav(b.name)}
                </div>
              )
            })}
          </>
        )}
      </nav>

      <div className="sidebar-foot">
        {role === 'owner' && (
          <button className={`nav-item${page === 'connectors' ? ' active' : ''}`} onClick={() => setPage('connectors')} title="Connect Claude">
            <span className="nav-ico">⇄</span>
            <span className="nav-label">Connect Claude</span>
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
