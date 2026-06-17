import { mockAttio } from '../adapters/attio/mockAttio'
import { money } from '../domain/budget'
import { clientForCampaign } from '../domain/clients'
import type { TrafficRow } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'

interface Snap {
  key: string
  name: string
  rows: number
  assets: number
  campaigns: number
  revenue: number
  posted: number
}

function snapshot(key: string, name: string, rows: TrafficRow[]): Snap {
  const names = new Set(rows.map((r) => r.assetName))
  let revenue = 0
  for (const n of names) revenue += mockAttio.attributionForAsset(n).wonRevenue
  return {
    key,
    name,
    rows: rows.length,
    assets: names.size,
    campaigns: new Set(rows.map((r) => (r.campaign ?? '').trim()).filter(Boolean)).size,
    revenue,
    posted: rows.filter((r) => r.status === 'posted').length,
  }
}

export function ClientTabs() {
  const rows = useTrafficStore((s) => s.rows)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)

  if (rows.length === 0) return null

  const clientNames = [...new Set(rows.map((r) => clientForCampaign(r.campaign)))].sort()
  const tabs: Snap[] = [
    snapshot('all', 'All clients', rows),
    ...clientNames.map((c) =>
      snapshot(c, c, rows.filter((r) => clientForCampaign(r.campaign) === c)),
    ),
  ]

  return (
    <div className="client-tabs" role="tablist" aria-label="Clients">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={clientFilter === t.key}
          className={`client-tab${clientFilter === t.key ? ' active' : ''}`}
          onClick={() => setClientFilter(t.key)}
        >
          <span className="client-tab-name">{t.name}</span>
          <span className="client-tab-stats">
            <span className="client-tab-rev">{money(t.revenue)}</span>
            <span className="client-tab-dot">·</span>
            {t.assets} asset{t.assets === 1 ? '' : 's'}
            <span className="client-tab-dot">·</span>
            {t.campaigns} campaign{t.campaigns === 1 ? '' : 's'}
            <span className="client-tab-dot">·</span>
            {t.posted} posted
          </span>
        </button>
      ))}
    </div>
  )
}
