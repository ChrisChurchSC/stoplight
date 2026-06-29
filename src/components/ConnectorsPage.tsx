import { isGoogleDriveConfigured } from '../adapters/drive'
import { useTrafficStore } from '../store/useTrafficStore'

interface Connector {
  name: string
  purpose: string
  status: 'connected' | 'mock' | 'config'
  detail: string
  /** Reached through Claude over MCP — not a separate app OAuth connector. */
  viaClaude?: boolean
  /** What you can drive from your own Claude once connected. */
  capabilities?: string[]
  /** How to wire it up. */
  howTo?: string[]
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
    purpose: 'Connect your Claude — set up brands from chat',
    status: 'config',
    detail:
      'Connect your own Claude (Desktop, over MCP) and it drives Hyperfocus live, in this tab. Everything it does lands as a draft for you to confirm — it proposes, you finish.',
    capabilities: [
      'Populate a brand’s About info (one-liner, mission, voice, products, differentiators)',
      'Pull in a brand’s live assets and messaging from its site and ads',
      'Write the messaging components — audiences, proof points, subjects, hooks, CTAs',
      'Generate draft assets for a campaign from everything connected',
    ],
    howTo: [
      'Add Hyperfocus to Claude Desktop (mcp/hyperfocus-server.mjs over stdio) — see docs/claude-desktop-mcp.md',
      'Keep this tab open with the dev server running — it’s the executor',
      'Set ANTHROPIC_API_KEY for live generation; without it, heuristic drafts fill in',
    ],
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
        <span className="page-sub">The services Hyperfocus runs on — connect to go from mock to live</span>
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
              {c.capabilities && (
                <ul className="settings-card-caps">
                  {c.capabilities.map((cap) => (
                    <li key={cap}>{cap}</li>
                  ))}
                </ul>
              )}
              {c.howTo && (
                <ol className="settings-card-howto">
                  {c.howTo.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
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
              ) : c.howTo ? null : (
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
