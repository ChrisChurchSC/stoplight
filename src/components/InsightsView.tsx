import { money } from '../domain/budget'
import { CHANNELS } from '../domain/channels'
import { computeInsights } from '../domain/insights'
import { buildOutcomeMap, summarizeByAudience } from '../domain/outcomeMap'
import { aggregatePatterns, type PatternDimension } from '../domain/outcomePatterns'
import { flagResolved } from '../adapters/icp/mockIcp'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'

/** Distinct customers before an anonymized cross-customer pattern is surfaced. */
const AGGREGATE_FLOOR = 10

const DIMENSION_LABEL: Record<PatternDimension, string> = {
  rtb: 'Proof',
  channel: 'Channel',
  stage: 'Stage',
  strategy: 'Strategy',
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="ins-bar">
      <div className="ins-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function InsightsView({ allClients = false }: { allClients?: boolean }) {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const query = useTrafficStore((s) => s.query)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const comments = useTrafficStore((s) => s.comments)
  const batchReview = useTrafficStore((s) => s.batchReview)
  const icp = useTrafficStore((s) => s.icp)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const coherenceDecisions = useTrafficStore((s) => s.coherenceDecisions)
  const aggregateContributing = useTrafficStore((s) => s.aggregateContributing)
  const setAggregateContributing = useTrafficStore((s) => s.setAggregateContributing)

  const view = allClients
    ? rows
    : rows.filter((r) => rowInScope(r, { filter, query, clientFilter, campaignFilter }))

  // The proprietary outcome map. Operational (per-customer) slice = the rows in
  // view; the aggregate (cross-customer) layer is always computed over ALL rows,
  // anonymized, and gated by the customer floor.
  const outcomeMap = buildOutcomeMap(view, { clientAudiences, campaigns: campaignList })
  const byAudience = summarizeByAudience(outcomeMap)
  const allOutcomeMap = buildOutcomeMap(rows, { clientAudiences, campaigns: campaignList })
  const aggregate = aggregatePatterns(allOutcomeMap, {
    floor: AGGREGATE_FLOOR,
    contributing: aggregateContributing,
  })

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
          {/* Outcome map — attributes → outcomes, sliced by audience type */}
          <section className="ins-card ins-wide">
            <div className="ins-card-head">
              <h3>Outcome map by audience</h3>
              <span className="ins-card-hint">
                What each variant was → what it did, keyed by tracking id (multi-touch revenue)
              </span>
            </div>
            <div className="omap">
              <div className="omap-row omap-head">
                <span>Audience type</span>
                <span>Variants</span>
                <span>Eng. rate</span>
                <span>Leads</span>
                <span>Revenue</span>
                <span>Top proof / channel</span>
              </div>
              {byAudience.map((a) => (
                <div className="omap-row" key={a.audienceType}>
                  <span className="omap-aud">{a.audienceType}</span>
                  <span>{a.variants}</span>
                  <span>{a.impressions > 0 ? pct(a.engagementRate) : '—'}</span>
                  <span>{a.leads ? a.leads.toFixed(a.leads % 1 ? 1 : 0) : '—'}</span>
                  <span className={a.revenue > 0 ? 'omap-rev' : 'omap-zero'}>
                    {a.revenue > 0 ? money(a.revenue) : '—'}
                  </span>
                  <span className="omap-top">
                    {a.topRtb ?? '—'}
                    {a.topChannel ? ` · ${CHANNELS[a.topChannel].label}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Aggregate learning layer — anonymized, cross-customer, floor-gated */}
          <section className="ins-card ins-wide agg">
            <div className="ins-card-head">
              <h3>Aggregate patterns (cross-customer)</h3>
              <span className="ins-card-hint">
                Anonymized learnings: which attributes drive outcomes by audience, across customers
              </span>
            </div>

            {!aggregate.contributing ? (
              <div className="ins-note">
                This account is opted out of the aggregate layer. It neither contributes data nor
                reads cross-customer patterns. Per-customer data above is unaffected.
              </div>
            ) : aggregate.unlocked.length > 0 ? (
              <div className="ins-rows">
                {aggregate.unlocked.slice(0, 8).map((p) => (
                  <div className="ins-row" key={`${p.dimension}:${p.audienceType}:${p.attribute}`}>
                    <div className="ins-row-label">
                      <span className="ins-row-name">
                        {p.attribute} → {p.audienceType}
                      </span>
                      <span className="ins-row-meta">
                        {DIMENSION_LABEL[p.dimension]} · {p.customers} customers · {p.variants} variants
                      </span>
                    </div>
                    <span className="ins-row-value">{money(p.revenuePerVariant)}/variant</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="agg-locked">
                <div className="agg-progress">
                  <div className="agg-progress-bar">
                    <div
                      className="agg-progress-fill"
                      style={{ width: `${Math.min(100, (aggregate.bestPatternCustomers / aggregate.floor) * 100)}%` }}
                    />
                  </div>
                  <span className="agg-progress-label">
                    {aggregate.bestPatternCustomers} of {aggregate.floor} customers (strongest pattern)
                  </span>
                </div>
                <p className="ins-note">
                  Patterns unlock at {aggregate.floor} distinct customers so nothing is
                  re-identifiable. {aggregate.lockedCount} pattern
                  {aggregate.lockedCount === 1 ? '' : 's'} held back
                  {aggregate.customersNeeded > 0
                    ? ` — ${aggregate.customersNeeded} more customer${aggregate.customersNeeded === 1 ? '' : 's'} to start surfacing.`
                    : '.'}
                </p>
              </div>
            )}

            <div className="agg-foot">
              <div className="agg-privacy">
                <strong>Privacy boundary.</strong> Per-customer assets, results, and coherence
                decisions stay the customer's, never exposed to another. Only anonymized aggregate
                patterns (≥{aggregate.floor} customers) leave the operational layer.
              </div>
              <label className="agg-toggle">
                <input
                  type="checkbox"
                  checked={aggregateContributing}
                  onChange={(e) => setAggregateContributing(e.target.checked)}
                />
                <span>Contribute to the anonymized aggregate (account-wide)</span>
              </label>
            </div>

            <div className="agg-coh">
              <span className="agg-coh-n">{coherenceDecisions.length}</span>
              coherence decision{coherenceDecisions.length === 1 ? '' : 's'} captured
              <span className="agg-coh-hint">
                (accept/override calls on the cross-variant check — a dataset only the gate produces)
              </span>
            </div>
          </section>

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
