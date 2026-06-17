import { clientForCampaign } from '../domain/clients'
import { useTrafficStore } from '../store/useTrafficStore'

export function Breadcrumb() {
  const rows = useTrafficStore((s) => s.rows)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)

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
    </div>
  )
}
