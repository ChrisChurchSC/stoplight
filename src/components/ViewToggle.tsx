import { useTrafficStore } from '../store/useTrafficStore'

// Connection leads — it's the storefront (the thesis), now a structured canvas.
// Grid is the workbench.
const VIEWS = [
  { key: 'flow', label: '⬡ Connection' },
  { key: 'grid', label: '▦ Grid' },
  { key: 'calendar', label: '◷ Calendar' },
] as const

export function ViewToggle() {
  const view = useTrafficStore((s) => s.view)
  const setView = useTrafficStore((s) => s.setView)
  // Refresh stays bottom-right; Comments + History moved up to the top bar.
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const refreshClient = useTrafficStore((s) => s.refreshClient)
  const refreshingClient = useTrafficStore((s) => s.refreshingClient)

  return (
    <div className="view-bar">
      {/* Left stays clear — the zoom controls float in the bottom-left corner. */}
      <div className="view-bar-side" />

      {/* The view switcher sits dead center. */}
      <div className="view-bar-center">
        <div className="view-toggle" role="group" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              className={`view-btn${view === v.key ? ' active' : ''}`}
              onClick={() => setView(v.key)}
              title={`${v.label.replace(/^\S+\s/, '')} view`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Refresh on the right (Comments + History moved to the top bar; the
          Add-asset button floats in the bottom-right corner). */}
      <div className="view-bar-side right">
        {clientProfiles[clientFilter]?.website && (
          <button
            className="btn sm"
            onClick={() => refreshClient(clientFilter)}
            disabled={refreshingClient === clientFilter}
            title="Re-gather this client's channels and refresh their live-messaging map"
          >
            {refreshingClient === clientFilter ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
        )}
      </div>
    </div>
  )
}
