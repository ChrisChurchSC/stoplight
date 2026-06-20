import {
  auditReadiness,
  readinessSummary,
  type ReadinessItem,
  type ReadyStatus,
} from '../domain/readiness'
import { rtbsForCampaign } from '../domain/rtb'
import { INSTALLED_TRACKING } from '../domain/tracking'
import { useTrafficStore } from '../store/useTrafficStore'

const STATUS_LABEL: Record<ReadyStatus, string> = {
  ready: 'Ready',
  generated: 'Needs confirm',
  missing: 'Missing',
}

/**
 * Onboarding readiness — the front-end of the Claude setup agent. Audits the
 * inputs the product depends on, generates starter versions of the gaps (brand
 * guide), and routes the rest to where they're set. Nothing hard-blocks: gaps
 * warn, the fast path is "confirm the draft Claude made."
 */
export function ReadinessPanel() {
  const open = useTrafficStore((s) => s.readinessOpen)
  const close = useTrafficStore((s) => s.closeReadiness)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const driveConnected = useTrafficStore((s) => s.driveConnected)
  const brandGuides = useTrafficStore((s) => s.brandGuides)
  const generateBrandGuide = useTrafficStore((s) => s.generateBrandGuide)
  const updateBrandGuide = useTrafficStore((s) => s.updateBrandGuide)
  const confirmBrandGuide = useTrafficStore((s) => s.confirmBrandGuide)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)
  const openAudienceWizard = useTrafficStore((s) => s.openAudienceWizard)
  const setPage = useTrafficStore((s) => s.setPage)
  const openTracking = useTrafficStore((s) => s.openTracking)

  if (!open) return null
  const client = clientFilter !== 'all' ? clientFilter : ''
  if (!client) return null

  const profile = clientProfiles[client]
  const entry = brandGuides[client]
  const campaigns = campaignList.filter((c) => c.client === client)
  const rtbCount = campaigns.reduce((n, c) => n + rtbsForCampaign(c.name).length, 0)

  const items = auditReadiness({
    hasWebsite: !!profile?.website,
    brandGuide: entry ? { confirmed: entry.confirmed } : undefined,
    audienceCount: clientAudiences[client]?.length ?? 0,
    channelConnected: driveConnected,
    rtbCount,
    trackingReady: INSTALLED_TRACKING.size > 0,
    crmConnected: false,
  })
  const summary = readinessSummary(items)
  const tier1 = items.filter((i) => i.tier === 1)
  const tier2 = items.filter((i) => i.tier === 2)

  const route = (item: ReadinessItem) => {
    switch (item.action) {
      case 'generate-brand':
        return generateBrandGuide(client)
      case 'add-audience':
        close()
        return openAudienceWizard()
      case 'connect-channel':
      case 'connect-crm':
        close()
        return setPage('connectors')
      case 'set-tracking':
        close()
        return openTracking('all')
      default:
        return undefined
    }
  }
  const actionLabel = (item: ReadinessItem): string | null => {
    switch (item.action) {
      case 'generate-brand':
        return '✦ Generate from site'
      case 'add-audience':
        return '＋ Add audience'
      case 'connect-channel':
        return 'Connect a channel'
      case 'set-tracking':
        return 'Set up tracking'
      case 'connect-crm':
        return 'Connect CRM'
      default:
        return null
    }
  }

  const Row = ({ item }: { item: ReadinessItem }) => (
    <div className={`rdy-row s-${item.status}`}>
      <div className="rdy-row-main">
        <span className={`rdy-dot s-${item.status}`} />
        <div className="rdy-row-text">
          <div className="rdy-row-label">
            {item.label}
            <span className={`rdy-pill s-${item.status}`}>{STATUS_LABEL[item.status]}</span>
          </div>
          <div className="rdy-row-why">{item.why}</div>
        </div>
      </div>
      {item.key === 'website' && item.status === 'missing' ? (
        <input
          className="rdy-web-input"
          placeholder="company.com"
          onKeyDown={(e) => {
            const v = (e.target as HTMLInputElement).value.trim()
            if (e.key === 'Enter' && v) setClientProfile(client, { website: v })
          }}
        />
      ) : (
        actionLabel(item) && (
          <button className="btn sm rdy-action" onClick={() => route(item)}>
            {actionLabel(item)}
          </button>
        )
      )}
    </div>
  )

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <aside className="drawer rdy-drawer">
        <div className="drawer-head">
          <strong>Readiness</strong>
          <span className={`rdy-summary${summary.canShip ? ' ok' : ''}`}>
            {summary.ready}/{summary.total} ready
          </span>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={close}>
            ✕
          </button>
        </div>

        <div className="drawer-body">
          <p className="rdy-intro">
            Before campaigns run, these are the inputs the product depends on. Claude audits what
            exists and drafts the gaps for you to confirm. Nothing here blocks launch.
          </p>

          <div className={`rdy-ship${summary.canShip ? ' go' : ' warn'}`}>
            {summary.canShip
              ? '✓ Brand starter confirmed — you can ship your first campaign.'
              : 'Confirm a brand starter to unlock the cleanest first run. You can still ship without it.'}
          </div>

          <div className="rdy-tier-label">Mandatory inputs · warns, never blocks</div>
          {tier1.map((i) => (
            <Row key={i.key} item={i} />
          ))}

          {entry && !entry.confirmed && (
            <div className="rdy-brand">
              <div className="rdy-brand-head">
                ✦ Starter brand guide for {client} — review and confirm
              </div>
              <label className="rdy-brand-field">
                <span>Voice</span>
                <textarea
                  value={entry.guide.voice}
                  onChange={(e) => updateBrandGuide(client, { voice: e.target.value })}
                />
              </label>
              <label className="rdy-brand-field">
                <span>Tone</span>
                <input
                  value={entry.guide.tone}
                  onChange={(e) => updateBrandGuide(client, { tone: e.target.value })}
                />
              </label>
              <div className="rdy-brand-cols">
                <div>
                  <span className="rdy-brand-sub">Do</span>
                  <ul>
                    {entry.guide.dos.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="rdy-brand-sub">Don't</span>
                  <ul>
                    {entry.guide.donts.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <label className="rdy-brand-field">
                <span>Visual</span>
                <textarea
                  value={entry.guide.visual}
                  onChange={(e) => updateBrandGuide(client, { visual: e.target.value })}
                />
              </label>
              <button className="btn sm primary rdy-confirm" onClick={() => confirmBrandGuide(client)}>
                ✓ Confirm brand guide
              </button>
            </div>
          )}

          <div className="rdy-tier-label">Recommended · warns only</div>
          {tier2.map((i) => (
            <Row key={i.key} item={i} />
          ))}
        </div>
      </aside>
    </>
  )
}
