import { useTrafficStore } from '../store/useTrafficStore'

export function Breadcrumb() {
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)

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
    </div>
  )
}
