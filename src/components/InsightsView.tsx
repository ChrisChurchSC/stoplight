import { money } from '../domain/budget'
import { computeInsights } from '../domain/insights'
import { flagResolved } from '../adapters/icp/mockIcp'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="ins-bar">
      <div className="ins-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function InsightsView() {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const query = useTrafficStore((s) => s.query)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const comments = useTrafficStore((s) => s.comments)
  const batchReview = useTrafficStore((s) => s.batchReview)
  const icp = useTrafficStore((s) => s.icp)

  const view = rows.filter((r) => rowInScope(r, { filter, query, clientFilter, campaignFilter }))

  const pains = icp?.pains ?? []
  const flaggedRowIds = new Set(
    (batchReview?.flags ?? [])
      .filter((fl) => !flagResolved(fl, rows.find((r) => r.id === fl.rowId)!, pains))
      .map((fl) => fl.rowId),
  )

  const ins = computeInsights(view, {
    comments,
    flaggedRowIds,
    hasReview: !!batchReview,
  })

  if (view.length === 0) {
    return (
      <div className="sheet-grid">
        <div className="ins ins-empty">No assets in scope. Load sample or widen the breadcrumb.</div>
      </div>
    )
  }

  const maxRtb = Math.max(1, ...ins.rtbRoi.map((r) => r.revenue))
  const maxStageRev = Math.max(1, ...ins.stages.map((s) => s.revenue))
  const maxStageAssets = Math.max(1, ...ins.stages.map((s) => s.assets))
  const maxChan = Math.max(1, ...ins.channels.map((c) => Math.max(c.revenue, c.leads * 1)))

  const onIcpRev = ins.icp.onIcp.revenue
  const flaggedRev = ins.icp.flagged.revenue

  return (
    <div className="sheet-grid">
      <div className="ins">
        {/* KPI strip */}
        <div className="ins-kpis">
          <div className="ins-kpi">
            <span className="ins-kpi-label">Attributed revenue</span>
            <span className="ins-kpi-value">{money(ins.kpis.revenue)}</span>
            <span className="ins-kpi-sub">{ins.kpis.posted} posted of {ins.kpis.rows} rows</span>
          </div>
          <div className="ins-kpi">
            <span className="ins-kpi-label">Open pipeline</span>
            <span className="ins-kpi-value">{money(ins.kpis.pipeline)}</span>
            <span className="ins-kpi-sub">first-touch attributed</span>
          </div>
          <div className="ins-kpi">
            <span className="ins-kpi-label">Leads</span>
            <span className="ins-kpi-value">{ins.kpis.leads}</span>
            <span className="ins-kpi-sub">contacts sourced</span>
          </div>
          <div className="ins-kpi">
            <span className="ins-kpi-label">Spend</span>
            <span className="ins-kpi-value">{ins.kpis.spend > 0 ? money(ins.kpis.spend) : '—'}</span>
            <span className="ins-kpi-sub">
              {ins.kpis.roas != null ? `${ins.kpis.roas.toFixed(1)}x ROAS` : 'Sync spend to populate'}
            </span>
          </div>
        </div>

        <div className="ins-cols">
          {/* Proof-point ROI */}
          <section className="ins-card ins-wide">
            <div className="ins-card-head">
              <h3>Proof-point ROI</h3>
              <span className="ins-card-hint">Revenue credited to each claim's RTB</span>
            </div>
            <div className="ins-rows">
              {ins.rtbRoi.map((r) => (
                <div className="ins-row" key={`${r.campaign}::${r.id}`}>
                  <div className="ins-row-label">
                    <span className="ins-row-name">{r.label}</span>
                    <span className="ins-row-meta">{r.campaign} · {r.assets} asset{r.assets === 1 ? '' : 's'}</span>
                  </div>
                  <Bar value={r.revenue} max={maxRtb} />
                  <span className={`ins-row-value${r.revenue === 0 ? ' zero' : ''}`}>
                    {r.revenue > 0 ? money(r.revenue) : 'no revenue'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Funnel coverage vs outcome */}
          <section className="ins-card">
            <div className="ins-card-head">
              <h3>User flow: coverage vs outcome</h3>
              <span className="ins-card-hint">Where content sits vs. where revenue lands</span>
            </div>
            <div className="ins-rows">
              {ins.stages.map((s) => (
                <div className="ins-stage" key={s.stage}>
                  <div className="ins-stage-head">
                    <span className="ins-row-name">{s.label}</span>
                    <span className="ins-row-meta">
                      {s.assets} asset{s.assets === 1 ? '' : 's'} · {money(s.revenue)} · {s.leads} lead{s.leads === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="ins-stage-bars">
                    <span className="ins-stage-tag">content</span>
                    <Bar value={s.assets} max={maxStageAssets} />
                  </div>
                  <div className="ins-stage-bars">
                    <span className="ins-stage-tag rev">revenue</span>
                    <Bar value={s.revenue} max={maxStageRev} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Channel performance */}
          <section className="ins-card">
            <div className="ins-card-head">
              <h3>Channel performance</h3>
              <span className="ins-card-hint">Revenue & leads by channel</span>
            </div>
            <div className="ins-rows">
              {ins.channels.map((c) => (
                <div className="ins-row" key={c.channel}>
                  <div className="ins-row-label">
                    <span className="ins-row-name">{c.label}</span>
                    <span className="ins-row-meta">
                      {c.assets} asset{c.assets === 1 ? '' : 's'} · {c.leads} lead{c.leads === 1 ? '' : 's'}
                      {c.spend > 0 ? ` · ${money(c.spend)} spend` : ''}
                    </span>
                  </div>
                  <Bar value={c.revenue} max={maxChan} />
                  <span className={`ins-row-value${c.revenue === 0 ? ' zero' : ''}`}>
                    {c.revenue > 0 ? money(c.revenue) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ICP alignment */}
          <section className="ins-card">
            <div className="ins-card-head">
              <h3>Does the ICP gate pay off?</h3>
              <span className="ins-card-hint">On-message vs. flagged assets</span>
            </div>
            {ins.icp.hasReview ? (
              <div className="ins-split">
                <div className="ins-split-half">
                  <span className="ins-split-label ok">On-ICP</span>
                  <span className="ins-split-value">{money(onIcpRev)}</span>
                  <span className="ins-row-meta">{ins.icp.onIcp.assets} assets · {ins.icp.onIcp.leads} leads</span>
                </div>
                <div className="ins-split-half">
                  <span className="ins-split-label bad">Flagged</span>
                  <span className="ins-split-value">{money(flaggedRev)}</span>
                  <span className="ins-row-meta">{ins.icp.flagged.assets} assets · {ins.icp.flagged.leads} leads</span>
                </div>
              </div>
            ) : (
              <div className="ins-note">Run the ICP review (in the gate) to compare on-message vs. flagged performance.</div>
            )}
          </section>

          {/* Engagement */}
          <section className="ins-card">
            <div className="ins-card-head">
              <h3>Engagement → intent</h3>
              <span className="ins-card-hint">Comments pulled from posted assets</span>
            </div>
            {ins.engagement.synced ? (
              <div className="ins-stats">
                <div className="ins-stat"><span>{ins.engagement.total}</span>comments</div>
                <div className="ins-stat"><span>{ins.engagement.intent}</span>buying intent</div>
                <div className="ins-stat"><span>{ins.engagement.needsReply}</span>need reply</div>
                <div className="ins-stat"><span>{ins.engagement.routed}</span>routed to CRM</div>
              </div>
            ) : (
              <div className="ins-note">Sync comments (toolbar) to see engagement and intent signals.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
