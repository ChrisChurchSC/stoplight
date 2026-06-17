import { useTrafficStore } from '../store/useTrafficStore'
import { IngestTray } from './IngestTray'

export function AssetsPage() {
  const assets = useTrafficStore((s) => s.assets)

  return (
    <div className="page">
      <div className="page-head">
        <h1>Assets</h1>
        <span className="page-sub">Dropped assets waiting to be trafficked into a client sheet</span>
      </div>
      <div className="page-body">
        <IngestTray />
        {assets.length === 0 && (
          <div className="page-empty">
            Drag files or links anywhere to add assets. Staged assets appear here until you assign
            them to channels and send them to a sheet.
          </div>
        )}
      </div>
    </div>
  )
}
