import { mockAttio } from '../adapters/attio/mockAttio'
import { money } from '../domain/budget'
import { clientForCampaign } from '../domain/clients'
import type { TrafficRow } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'

interface Snap {
  key: string
  name: string
  assets: number
  revenue: number
  posted: number
  scheduled: number
}

function snapshot(key: string, name: string, rows: TrafficRow[]): Snap {
  const names = new Set(rows.map((r) => r.assetName))
  let revenue = 0
  for (const n of names) revenue += mockAttio.attributionForAsset(n).wonRevenue
  return {
    key,
    name,
    assets: names.size,
    revenue,
    posted: rows.filter((r) => r.status === 'posted').length,
    scheduled: rows.filter((r) => r.status === 'scheduled').length,
  }
}

/** Campaign switcher (with snapshots) for the active client. */
export function CampaignTabs() {
  const rows = useTrafficStore((s) => s.rows)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)
  const campaignList = useTrafficStore((s) => s.campaignList)

  const clientRows = rows.filter((r) => clientForCampaign(r.campaign) === clientFilter)
  // Campaigns from existing rows + ones created in the wizard (which may have no rows yet).
  const registered = campaignList.filter((c) => c.client === clientFilter).map((c) => c.name)
  if (clientRows.length === 0 && registered.length === 0) return null

  const campaigns = [
    ...new Set([...clientRows.map((r) => (r.campaign ?? '').trim()).filter(Boolean), ...registered]),
  ].sort()
  const tabs: Snap[] = [
    snapshot('all', 'All campaigns', clientRows),
    ...campaigns.map((c) => snapshot(c, c, clientRows.filter((r) => (r.campaign ?? '').trim() === c))),
  ]

  return (
    <div className="client-tabs" role="tablist" aria-label="Campaigns">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={campaignFilter === t.key}
          className={`client-tab${campaignFilter === t.key ? ' active' : ''}`}
          onClick={() => setCampaignFilter(t.key)}
        >
          <span className="client-tab-name">{t.name}</span>
          <span className="client-tab-stats">
            <span className="client-tab-rev">{money(t.revenue)}</span>
            <span className="client-tab-dot">·</span>
            {t.assets} asset{t.assets === 1 ? '' : 's'}
            <span className="client-tab-dot">·</span>
            {t.posted} posted
            <span className="client-tab-dot">·</span>
            {t.scheduled} scheduled
          </span>
        </button>
      ))}
    </div>
  )
}
