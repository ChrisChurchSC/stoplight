interface Integration {
  name: string
  purpose: string
  status: 'connected' | 'mock' | 'config'
  detail: string
}

const INTEGRATIONS: Integration[] = [
  { name: 'Clay', purpose: 'ICP enrichment', status: 'mock', detail: 'Sample ICP pull. Swap MockIcpSource for the Clay MCP.' },
  { name: 'Anthropic (Claude)', purpose: 'ICP messaging review', status: 'config', detail: 'Set ANTHROPIC_API_KEY to enable real review; heuristic fallback otherwise.' },
  { name: 'Attio', purpose: 'Attribution & closed-won', status: 'mock', detail: 'MockAttioAdapter. Swap for the Attio MCP (contacts + deals).' },
  { name: 'Buffer / HubSpot', purpose: 'Publishing', status: 'mock', detail: 'Mock publishers. Wire BufferPublisher (MCP) behind the registry.' },
  { name: 'Channels', purpose: 'Channel roster', status: 'config', detail: '24 channels with kind, platform, best-times.' },
  { name: 'UTM convention', purpose: 'Tracking', status: 'config', detail: 'Canonical source/medium per channel + pixel/event checks.' },
  { name: 'RTB library', purpose: 'Proof points', status: 'config', detail: 'Authored reasons-to-believe per campaign.' },
]

const STATUS_LABEL: Record<Integration['status'], string> = {
  connected: 'Connected',
  mock: 'Mock',
  config: 'Configured',
}

export function SettingsPage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Settings</h1>
        <span className="page-sub">Integrations and configuration that the workspace rides on</span>
      </div>
      <div className="page-body">
        <div className="settings-grid">
          {INTEGRATIONS.map((i) => (
            <div key={i.name} className="settings-card">
              <div className="settings-card-head">
                <span className="settings-card-name">{i.name}</span>
                <span className={`settings-badge s-${i.status}`}>{STATUS_LABEL[i.status]}</span>
              </div>
              <div className="settings-card-purpose">{i.purpose}</div>
              <div className="settings-card-detail">{i.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
