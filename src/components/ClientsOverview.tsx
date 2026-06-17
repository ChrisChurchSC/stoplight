import { mockAttio } from '../adapters/attio/mockAttio'
import { money } from '../domain/budget'
import { clientForCampaign } from '../domain/clients'
import type { TrafficRow } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'

interface Card {
  client: string
  rows: number
  assets: number
  campaigns: string[]
  revenue: number
  leads: number
  posted: number
  scheduled: number
  drafts: number
}

function card(client: string, rows: TrafficRow[]): Card {
  const names = new Set(rows.map((r) => r.assetName))
  let revenue = 0
  let leads = 0
  for (const n of names) {
    const a = mockAttio.attributionForAsset(n)
    revenue += a.wonRevenue
    leads += a.leads
  }
  return {
    client,
    rows: rows.length,
    assets: names.size,
    campaigns: [...new Set(rows.map((r) => (r.campaign ?? '').trim()).filter(Boolean))].sort(),
    revenue,
    leads,
    posted: rows.filter((r) => r.status === 'posted').length,
    scheduled: rows.filter((r) => r.status === 'scheduled').length,
    drafts: rows.filter((r) => r.status === 'draft').length,
  }
}

export function ClientsOverview() {
  const rows = useTrafficStore((s) => s.rows)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)

  const clientNames = [...new Set(rows.map((r) => clientForCampaign(r.campaign)))].sort()
  const cards = clientNames.map((c) => card(c, rows.filter((r) => clientForCampaign(r.campaign) === c)))

  const totalRevenue = mockAttio.totalWonRevenue()
  const totalLeads = cards.reduce((a, c) => a + c.leads, 0)
  const totalAssets = new Set(rows.map((r) => r.assetName)).size

  if (rows.length === 0) {
    return (
      <div className="sheet-grid">
        <div className="clients-empty">No clients yet. Load sample or add assets.</div>
      </div>
    )
  }

  return (
    <div className="sheet-grid">
      <div className="clients-page">
        <div className="clients-portfolio">
          <div className="clients-port-stat">
            <span className="clients-port-label">Clients</span>
            <span className="clients-port-value">{clientNames.length}</span>
          </div>
          <div className="clients-port-stat">
            <span className="clients-port-label">Attributed revenue</span>
            <span className="clients-port-value">{money(totalRevenue)}</span>
          </div>
          <div className="clients-port-stat">
            <span className="clients-port-label">Leads</span>
            <span className="clients-port-value">{totalLeads}</span>
          </div>
          <div className="clients-port-stat">
            <span className="clients-port-label">Assets</span>
            <span className="clients-port-value">{totalAssets}</span>
          </div>
        </div>

        <div className="clients-grid">
          {cards.map((c) => (
            <button key={c.client} className="client-card" onClick={() => setClientFilter(c.client)}>
              <div className="client-card-head">
                <span className="client-card-name">{c.client}</span>
                <span className="client-card-rev">{money(c.revenue)}</span>
              </div>
              <div className="client-card-stats">
                <span>{c.assets} assets</span>
                <span>{c.leads} leads</span>
                <span>{c.posted} posted</span>
                <span>{c.scheduled} scheduled</span>
                <span>{c.drafts} draft</span>
              </div>
              <div className="client-card-campaigns">
                {c.campaigns.map((camp) => (
                  <span key={camp} className="client-card-camp">{camp}</span>
                ))}
              </div>
              <span className="client-card-open">Open client →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
