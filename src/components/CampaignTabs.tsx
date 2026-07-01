import { clientForCampaign } from '../domain/clients'
import { useTrafficStore } from '../store/useTrafficStore'

/** Campaign switcher for the active client. */
export function CampaignTabs() {
  const rows = useTrafficStore((s) => s.rows)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const openCampaignWizard = useTrafficStore((s) => s.openCampaignWizard)

  const clientRows = rows.filter((r) => clientForCampaign(r.campaign) === clientFilter)
  // Campaigns from existing rows + ones created in the wizard (which may have no rows yet).
  const registered = campaignList.filter((c) => c.client === clientFilter).map((c) => c.name)
  if (clientRows.length === 0 && registered.length === 0) return null

  const campaigns = [
    ...new Set([...clientRows.map((r) => (r.campaign ?? '').trim()).filter(Boolean), ...registered]),
  ].sort()
  const tabs = [{ key: 'all', name: 'All campaigns' }, ...campaigns.map((c) => ({ key: c, name: c }))]

  return (
    <div className="client-tabs-wrap">
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
          </button>
        ))}
      </div>
      <button
        className="client-tab-add"
        onClick={() => openCampaignWizard(clientFilter)}
        title={`Add a campaign to ${clientFilter}`}
      >
        ＋ Add campaign
      </button>
    </div>
  )
}
