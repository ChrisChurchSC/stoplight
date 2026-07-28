import { useTrafficStore } from '../store/useTrafficStore'
import { CampaignStatesHome } from './CampaignStatesHome'
import { FoundationView } from './FoundationView'
import { LiveView } from './LiveView'
import { MatrixView } from './MatrixView'

/**
 * Level 1 — the brand workspace as layers, not one screen. Foundation (the
 * standing audience-and-messaging model), Personalize (the audience × stage ×
 * channel matrix), and Campaigns (the execution hub). The layer tabs now live up
 * in the top bar (BrandTabs, rendered by Breadcrumb); this component only
 * switches the body for the brandView the tabs set. The Campaigns tab holds two
 * sub-views: the lifecycle dashboard and Live (everything in-market now). Picking
 * a campaign drops to Level 2 (the canvas), where performance is an on-map
 * overlay rather than a separate page.
 */
export function BrandWorkspace() {
  const brandView = useTrafficStore((s) => s.brandView)

  // The Campaigns tab owns two sub-views — the lifecycle dashboard and the Live
  // workspace — so both route here.
  const onCampaigns = brandView === 'campaigns' || brandView === 'live'

  return (
    <div className="brandws">
      {onCampaigns ? (
        // Campaigns hub: lifecycle dashboard + Live, switched by a sub-toggle.
        <CampaignsArea />
      ) : (
        // Foundation + Personalize are document content — scroll within the body.
        <div className="brandws-scroll">
          {brandView === 'foundation' ? <FoundationView /> : <MatrixView />}
        </div>
      )}
    </div>
  )
}

const SUBS = [
  { key: 'campaigns', label: 'Campaigns', hint: 'Active · Planning · In Review · Completed' },
  { key: 'live', label: 'Live', hint: "Everything in-market now" },
] as const

/** The Campaigns tab's body: a sub-toggle between the lifecycle dashboard and the
 *  Live workspace. Live owns its own height + scroll; the dashboard scrolls as a
 *  document, so each sub-view sits in the layout it needs. */
function CampaignsArea() {
  const brandView = useTrafficStore((s) => s.brandView)
  const setBrandView = useTrafficStore((s) => s.setBrandView)
  const sub = brandView === 'live' ? 'live' : 'campaigns'

  return (
    <div className="campaigns-area">
      <div className="campaigns-subtabs" role="tablist" aria-label="Campaigns views">
        {SUBS.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={sub === s.key}
            className={`campaigns-subtab${sub === s.key ? ' active' : ''}`}
            onClick={() => setBrandView(s.key)}
            title={s.hint}
          >
            {s.label}
          </button>
        ))}
      </div>

      {sub === 'live' ? (
        <LiveView />
      ) : (
        <div className="brandws-scroll">
          <CampaignStatesHome />
        </div>
      )}
    </div>
  )
}
