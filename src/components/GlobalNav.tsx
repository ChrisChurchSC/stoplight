import { can } from '../domain/access'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The persistent global rail — slim, icon-only wayfinding present at every
 * navigation altitude (home, brand workspace, Library / Connectors / Billing).
 * It's deliberately NOT rendered over the full-bleed campaign canvas, where the
 * floating chrome + wordmark-as-home own the space; the rail is for moving between
 * spaces, not for deep work. Connectors + Billing are owner-only and sit at the
 * foot, away from the everyday Home / Library destinations.
 */

const CAR =
  'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z'

export function GlobalNav() {
  const page = useTrafficStore((s) => s.page)
  const setPage = useTrafficStore((s) => s.setPage)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const role = useTrafficStore((s) => s.role)

  const goHome = () => {
    setPage('clients')
    setClientFilter('all')
  }

  return (
    <nav className="global-nav">
      <div className="global-brand">
        <div className="logo">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff" aria-hidden="true">
            <path d={CAR} />
          </svg>
        </div>
      </div>

      <div className="global-nav-items">
        <button
          className={`global-nav-item${page === 'clients' ? ' active' : ''}`}
          onClick={goHome}
          title="Home — your clients, recents, and what needs you"
        >
          <span className="global-nav-ico">⌂</span>
          <span className="global-nav-label">Home</span>
        </button>
        <button
          className={`global-nav-item${page === 'library' ? ' active' : ''}`}
          onClick={() => setPage('library')}
          title="Messaging systems — reusable audiences, proof, subjects, hooks, CTAs per brand"
        >
          <span className="global-nav-ico">▤</span>
          <span className="global-nav-label">Messaging</span>
        </button>
      </div>

      <div className="global-nav-foot">
        {role === 'owner' && (
          <button
            className={`global-nav-item${page === 'connectors' ? ' active' : ''}`}
            onClick={() => setPage('connectors')}
            title="Connectors — integrations (Attio, Buffer, Drive, vision)"
          >
            <span className="global-nav-ico">⇄</span>
            <span className="global-nav-label">Connectors</span>
          </button>
        )}
        {can(role, 'billing') && (
          <button
            className={`global-nav-item${page === 'billing' ? ' active' : ''}`}
            onClick={() => setPage('billing')}
            title="Billing"
          >
            <span className="global-nav-ico">◫</span>
            <span className="global-nav-label">Billing</span>
          </button>
        )}
      </div>
    </nav>
  )
}
