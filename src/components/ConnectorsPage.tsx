import { isGoogleDriveConfigured } from '../adapters/drive'
import { useTrafficStore } from '../store/useTrafficStore'

interface Connector {
  name: string
  purpose: string
  status: 'connected' | 'mock' | 'config'
  detail: string
  /** Reached through Claude over MCP — not a separate app OAuth connector. */
  viaClaude?: boolean
}

const CONNECTORS: Connector[] = [
  {
    name: 'Google Drive',
    purpose: 'Asset import & auto-organize',
    status: isGoogleDriveConfigured ? 'config' : 'mock',
    detail: isGoogleDriveConfigured
      ? 'Connected via OAuth (drive.file scope, no key stored). Folders → channel + type through the same classifier as local uploads.'
      : 'Demo Drive fixture now (folders → channel + type). Set VITE_GOOGLE_CLIENT_ID + VITE_GOOGLE_API_KEY to connect a real Drive (drive.file scope, no app secret).',
  },
  {
    name: 'Claude',
    purpose: 'Setup, ICP enrichment, review, copy',
    status: 'config',
    detail:
      'Set ANTHROPIC_API_KEY to enable real generation; heuristic fallback otherwise. Connecting Claude also brings its MCP tools (ICP enrichment, Attio, publishing) — no separate OAuth for those.',
  },
]

const STATUS_LABEL: Record<Connector['status'], string> = {
  connected: 'Connected',
  mock: 'Mock',
  config: 'Configured',
}

export function ConnectorsPage() {
  const importFromDrive = useTrafficStore((s) => s.importFromDrive)
  const importFolderFromDrive = useTrafficStore((s) => s.importFolderFromDrive)
  const connectDrive = useTrafficStore((s) => s.connectDrive)
  const driveConnected = useTrafficStore((s) => s.driveConnected)
  return (
    <div className="page">
      <div className="page-head">
        <h1>Connectors</h1>
        <span className="page-sub">The services Rushhour runs on — connect to go from mock to live</span>
      </div>
      <div className="page-body">
        <div className="settings-grid">
          {CONNECTORS.map((c) => (
            <div key={c.name} className="settings-card">
              <div className="settings-card-head">
                <span className="settings-card-name">{c.name}</span>
                <span className={`settings-badge${c.viaClaude ? ' s-via' : ` s-${c.status}`}`}>
                  {c.viaClaude ? 'via Claude' : STATUS_LABEL[c.status]}
                </span>
              </div>
              <div className="settings-card-purpose">{c.purpose}</div>
              <div className="settings-card-detail">{c.detail}</div>
              {c.viaClaude ? (
                <span className="settings-card-via">↳ Connected through Claude</span>
              ) : c.name === 'Google Drive' ? (
                <div className="settings-card-actions">
                  {driveConnected ? (
                    <span className="drive-connected">
                      ✓ {isGoogleDriveConfigured ? 'Account connected' : 'Demo connected'}
                    </span>
                  ) : (
                    <button className="btn sm settings-card-btn" onClick={() => connectDrive()}>
                      Connect account
                    </button>
                  )}
                  <button className="btn sm settings-card-btn" onClick={() => importFolderFromDrive()}>
                    Connect folder
                  </button>
                  <button className="btn sm settings-card-btn" onClick={() => importFromDrive()}>
                    {isGoogleDriveConfigured ? 'Import files' : 'Browse Demo Drive'}
                  </button>
                </div>
              ) : (
                <button className="btn sm settings-card-btn" disabled>
                  {c.status === 'connected' ? 'Manage' : 'Connect'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
