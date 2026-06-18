import { mockAttio } from '../adapters/attio/mockAttio'
import { money } from '../domain/budget'
import { CHANNELS } from '../domain/channels'
import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from '../domain/funnel'
import type { ChannelId, RowStatus, TrafficRow } from '../domain/types'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

// Card accent reflects delivery status, so the journey still signals state.
const STATUS_COLOR: Record<RowStatus, string> = {
  draft: '#9aa0aa',
  approved: 'var(--blue)',
  scheduled: 'var(--blue)',
  posted: 'var(--green)',
  failed: '#b42318',
}

export function FlowView() {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const query = useTrafficStore((s) => s.query)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const openReview = useTrafficStore((s) => s.openReview)

  const view = rows.filter((r) => rowInScope(r, { filter, query, clientFilter, campaignFilter }))

  const stageData = (stage: FunnelStage) => {
    const items = view
      .filter((r) => funnelStageFor(r.channel) === stage)
      .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
    const channels = [...new Set(items.map((r) => r.channel))] as ChannelId[]
    const names = new Set(items.map((r) => r.assetName))
    let revenue = 0
    let leads = 0
    for (const n of names) {
      const a = mockAttio.attributionForAsset(n)
      revenue += a.wonRevenue
      leads += a.leads
    }
    return { items, channels, assets: names.size, revenue, leads }
  }

  const targetId = (name: string) => rows.find((r) => r.assetName === name)?.id

  const Card = ({ row }: { row: TrafficRow }) => {
    const linkId = row.linksTo ? targetId(row.linksTo) : undefined
    return (
      <button
        className="flow-card"
        style={{ borderLeftColor: STATUS_COLOR[row.status] }}
        onClick={() => openReview(row.id)}
        title={`${CHANNELS[row.channel].label} · ${row.assetName}`}
      >
        <div className="flow-card-head">
          <ChannelIcon channel={row.channel} size={13} />
          <span className="flow-card-name">{row.assetName}</span>
        </div>
        {row.campaign && <span className="flow-card-campaign">{row.campaign}</span>}
        {row.linksTo && (
          <span
            className="flow-card-link"
            title={`Drives to ${row.linksTo}`}
            onClick={(e) => {
              e.stopPropagation()
              if (linkId) openReview(linkId)
            }}
          >
            → {row.linksTo}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="sheet-grid">
      <div className="journey">
        <div className="journey-intro">
          The path a prospect travels — each stage links to the next, ending where revenue lands.
        </div>

        <div className="journey-rail">
          {FUNNEL_STAGES.map((stage, i) => {
            const d = stageData(stage.stage)
            return (
              <div className="journey-station-wrap" key={stage.stage}>
                <div className="journey-station">
                  <div className="journey-step">
                    <span className="journey-step-num">{i + 1}</span>
                    <div className="journey-step-meta">
                      <div className="journey-step-name">{stage.label}</div>
                      <div className="journey-step-hint">{stage.hint}</div>
                    </div>
                  </div>

                  <div className="journey-channels" title="Channels that touch the user here">
                    {d.channels.length === 0 ? (
                      <span className="journey-none">no touchpoints</span>
                    ) : (
                      d.channels.map((c) => (
                        <span key={c} className="journey-chan" title={CHANNELS[c].label}>
                          <ChannelIcon channel={c} size={15} />
                        </span>
                      ))
                    )}
                  </div>

                  <div className="journey-outcome">
                    <span className="journey-outcome-stat">
                      <b>{d.assets}</b> asset{d.assets === 1 ? '' : 's'}
                    </span>
                    {d.leads > 0 && (
                      <span className="journey-outcome-stat">
                        <b>{d.leads}</b> lead{d.leads === 1 ? '' : 's'}
                      </span>
                    )}
                    {d.revenue > 0 && <span className="journey-outcome-rev">{money(d.revenue)}</span>}
                  </div>

                  <div className="journey-assets">
                    {d.items.length === 0 ? (
                      <div className="flow-empty">—</div>
                    ) : (
                      d.items.map((row) => <Card key={row.id} row={row} />)
                    )}
                  </div>
                </div>

                {i < FUNNEL_STAGES.length - 1 && (
                  <div className="journey-link" aria-hidden="true">
                    →
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
