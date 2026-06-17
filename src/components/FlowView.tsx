import { CHANNELS } from '../domain/channels'
import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from '../domain/funnel'
import type { RowStatus, TrafficRow } from '../domain/types'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

// Card accent reflects delivery status, so the journey view still signals state.
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

  const view = rows.filter((r) =>
    rowInScope(r, { filter, query, clientFilter, campaignFilter }),
  )

  const byStage = (stage: FunnelStage) =>
    view
      .filter((r) => funnelStageFor(r.channel) === stage)
      .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))

  const Card = ({ row }: { row: TrafficRow }) => (
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
    </button>
  )

  return (
    <div className="sheet-grid">
      <div className="flow">
        <div className="flow-lanes">
          {FUNNEL_STAGES.map((stage, i) => {
            const items = byStage(stage.stage)
            return (
              <div className="flow-lane-wrap" key={stage.stage}>
                <div className="flow-lane">
                  <div className="flow-lane-head">
                    <span className="flow-lane-title">{stage.label}</span>
                    <span className="flow-lane-count">{items.length}</span>
                  </div>
                  <div className="flow-lane-hint">{stage.hint}</div>
                  <div className="flow-cards">
                    {items.length === 0 ? (
                      <div className="flow-empty">—</div>
                    ) : (
                      items.map((row) => <Card key={row.id} row={row} />)
                    )}
                  </div>
                </div>
                {i < FUNNEL_STAGES.length - 1 && <div className="flow-arrow">›</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
