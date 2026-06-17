import { CHANNELS } from '../domain/channels'
import type { RowStatus, TrafficRow } from '../domain/types'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

// The trafficking pipeline, left to right. Failed is an off-flow lane.
const STAGES: { status: RowStatus; label: string; hint: string }[] = [
  { status: 'draft', label: 'Draft', hint: 'Being prepared' },
  { status: 'approved', label: 'Approved', hint: 'Gates cleared' },
  { status: 'scheduled', label: 'Scheduled', hint: 'Queued to post' },
  { status: 'posted', label: 'Posted', hint: 'Live' },
]

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

  const byStatus = (status: RowStatus) =>
    view
      .filter((r) => r.status === status)
      .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))

  const failed = byStatus('failed')

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
          {STAGES.map((stage, i) => {
            const items = byStatus(stage.status)
            return (
              <div className="flow-lane-wrap" key={stage.status}>
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
                {i < STAGES.length - 1 && <div className="flow-arrow">›</div>}
              </div>
            )
          })}
        </div>

        {failed.length > 0 && (
          <div className="flow-failed">
            <div className="flow-lane-head">
              <span className="flow-lane-title">⚠ Failed</span>
              <span className="flow-lane-count">{failed.length}</span>
            </div>
            <div className="flow-cards row">
              {failed.map((row) => (
                <div key={row.id} className="flow-failed-item">
                  <Card row={row} />
                  {row.error && <span className="flow-error">{row.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
