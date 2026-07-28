import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Sub-nav that unifies Insights into one page: "Metrics" is the live connected-data view (Signals,
 * what's true right now) and "Reports" is the saved Claude write-ups (dated syntheses). One nav item,
 * two tabs, instead of two separate sidebar entries. Renders nothing outside the Insights context.
 */
export function InsightsTabs() {
  const page = useTrafficStore((s) => s.page)
  const libraryMode = useTrafficStore((s) => s.libraryMode)
  const setPage = useTrafficStore((s) => s.setPage)
  const setLibraryMode = useTrafficStore((s) => s.setLibraryMode)

  const onReports = page === 'reports'
  const onMetrics = page === 'content' && libraryMode === 'data'
  if (!onReports && !onMetrics) return null

  return (
    <div className="insights-tabs">
      <button className={`insights-tab${onMetrics ? ' active' : ''}`} onClick={() => setLibraryMode('data')}>
        Metrics
      </button>
      <button className={`insights-tab${onReports ? ' active' : ''}`} onClick={() => setPage('reports')}>
        Reports
      </button>
    </div>
  )
}
