interface Connector {
  name: string
  purpose: string
  status: 'connected' | 'mock' | 'config'
  detail: string
}

const CONNECTORS: Connector[] = [
  { name: 'Clay', purpose: 'ICP enrichment', status: 'mock', detail: 'Sample ICP pull. Swap MockIcpSource for the Clay MCP.' },
  { name: 'Anthropic (Claude)', purpose: 'ICP messaging review', status: 'config', detail: 'Set ANTHROPIC_API_KEY to enable real review; heuristic fallback otherwise.' },
  { name: 'Attio', purpose: 'Attribution & closed-won', status: 'mock', detail: 'MockAttioAdapter. Swap for the Attio MCP (contacts + deals).' },
  { name: 'Buffer', purpose: 'Publishing (social)', status: 'mock', detail: 'Mock publisher. Wire BufferPublisher (MCP) behind the registry.' },
  { name: 'HubSpot', purpose: 'Publishing (owned)', status: 'mock', detail: 'Mock publisher for email / landing pages.' },
  { name: 'Channels', purpose: 'Channel roster', status: 'config', detail: '24 channels with kind, platform, best-times.' },
  { name: 'UTM convention', purpose: 'Tracking', status: 'config', detail: 'Canonical source/medium per channel + pixel/event checks.' },
  { name: 'RTB library', purpose: 'Proof points', status: 'config', detail: 'Authored reasons-to-believe per campaign.' },
]

const STATUS_LABEL: Record<Connector['status'], string> = {
  connected: 'Connected',
  mock: 'Mock',
  config: 'Configured',
}

export function ConnectorsPage() {
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
                <span className={`settings-badge s-${c.status}`}>{STATUS_LABEL[c.status]}</span>
              </div>
              <div className="settings-card-purpose">{c.purpose}</div>
              <div className="settings-card-detail">{c.detail}</div>
              <button className="btn sm settings-card-btn" disabled>
                {c.status === 'connected' ? 'Manage' : 'Connect'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
