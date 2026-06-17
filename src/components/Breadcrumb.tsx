import { mockAttio } from '../adapters/attio/mockAttio'
import { useTrafficStore } from '../store/useTrafficStore'

export function Breadcrumb() {
  const rows = useTrafficStore((s) => s.rows)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)

  const posted = rows.filter((r) => r.status === 'posted').length
  const approved = rows.filter((r) => r.status === 'approved' || r.status === 'scheduled').length

  const overview = clientFilter === 'all'

  return (
    <div className="breadcrumb">
      {overview ? (
        <span className="crumb active">All clients</span>
      ) : (
        <button className="crumb crumb-link" onClick={() => setClientFilter('all')}>
          All clients
        </button>
      )}
      {!overview && (
        <>
          <span className="crumb-sep">/</span>
          <span className="crumb active">{clientFilter}</span>
          <span className="crumb-sep">/</span>
          <span className="crumb">{campaignFilter === 'all' ? 'All campaigns' : campaignFilter}</span>
        </>
      )}

      <span className="spacer" />

      <div className="bc-stats">
        <span className="toolbar-stat">▦ {rows.length} rows</span>
        <span className="toolbar-stat">
          <span className="dot" style={{ background: 'var(--blue)' }} /> {approved} approved
        </span>
        <span className="toolbar-stat">
          <span className="dot" style={{ background: 'var(--green)' }} /> {posted} posted
        </span>
        <span className="toolbar-stat" title="Closed-won revenue attributed to assets (Attio)">
          ↗ ${mockAttio.totalWonRevenue().toLocaleString()} won
        </span>
      </div>
    </div>
  )
}
