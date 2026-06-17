import { clientForCampaign } from '../domain/clients'
import { mockAttio } from '../adapters/attio/mockAttio'
import { useTrafficStore } from '../store/useTrafficStore'

const VIEWS = [
  { key: 'grid', label: '▦ Grid' },
  { key: 'calendar', label: '◷ Calendar' },
  { key: 'flow', label: '⇄ Flow' },
  { key: 'insights', label: '◧ Insights' },
] as const

export function Breadcrumb() {
  const rows = useTrafficStore((s) => s.rows)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)
  const view = useTrafficStore((s) => s.view)
  const setView = useTrafficStore((s) => s.setView)

  // Distinct clients across all rows, and campaigns within the active client.
  const clients = [...new Set(rows.map((r) => clientForCampaign(r.campaign)))].sort()
  const campaigns = [
    ...new Set(
      rows
        .filter((r) => clientFilter === 'all' || clientForCampaign(r.campaign) === clientFilter)
        .map((r) => (r.campaign ?? '').trim())
        .filter(Boolean),
    ),
  ].sort()

  const posted = rows.filter((r) => r.status === 'posted').length
  const approved = rows.filter((r) => r.status === 'approved' || r.status === 'scheduled').length

  return (
    <div className="breadcrumb">
      <span className="crumb">Clients</span>
      <span className="crumb-sep">/</span>
      <select
        className="crumb-select"
        value={clientFilter}
        onChange={(e) => setClientFilter(e.target.value)}
        title="Client"
      >
        <option value="all">All clients</option>
        {clients.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <span className="crumb-sep">/</span>
      <select
        className={`crumb-select${campaignFilter === 'all' ? ' muted' : ''}`}
        value={campaignFilter}
        onChange={(e) => setCampaignFilter(e.target.value)}
        title="Campaign"
      >
        <option value="all">All campaigns</option>
        {campaigns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

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
  )
}
