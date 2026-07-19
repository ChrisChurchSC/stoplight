import { useEffect, useState } from 'react'
import { money } from '../domain/budget'
import { CHANNELS } from '../domain/channels'
import { computeInsights } from '../domain/insights'
import { buildOutcomeMap, summarizeByAudience } from '../domain/outcomeMap'
import { learnJourneysByAudience } from '../domain/journeyLearning'
import { aggregatePatterns, type PatternDimension } from '../domain/outcomePatterns'
import { readAggregatePatterns, type PooledPattern } from '../adapters/aggregate/aggregateOutcomes'
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
  const proofFilter = useTrafficStore((s) => s.proofFilter)
  const ctaFilter = useTrafficStore((s) => s.ctaFilter)
  const audienceFilter = useTrafficStore((s) => s.audienceFilter)
  const cardFilter = useTrafficStore((s) => s.cardFilter)
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
  const brandActuals = useTrafficStore((s) => s.brandActuals)

  const view = allClients
    ? rows
    : rows.filter((r) => rowInScope(r, { filter, proofFilter, ctaFilter, audienceFilter, cardFilter, query, clientFilter, campaignFilter }))

  // The proprietary outcome map. Operational (per-customer) slice = the rows in
  // view; the aggregate (cross-customer) layer is always computed over ALL rows,
  // anonymized, and gated by the customer floor.
  const outcomeMap = buildOutcomeMap(view, { clientAudiences, campaigns: campaignList })
  const byAudience = summarizeByAudience(outcomeMap)
  // Which journeys (campaigns) worked for which audiences over time — quarter buckets, ranked by
  // measured outcome. Reads live metrics, so it fills in as analytics sync.
  const journeyLearning = learnJourneysByAudience(view, {
    client: allClients || clientFilter === 'all' ? '' : clientFilter,
    bucket: 'quarter',
    rankBy: 'outcome',
  })
  const shortCampaign = (name: string) => name.replace(/^.*? — /, '')
  const allOutcomeMap = buildOutcomeMap(rows, { clientAudiences, campaigns: campaignList })
  const aggregate = aggregatePatterns(allOutcomeMap, {
    floor: AGGREGATE_FLOOR,
    contributing: aggregateContributing,
  })

  // The REAL cross-customer pool (floor-gated RPC). Returns [] until migration 0006 is applied and
  // enough distinct workspaces have contributed; until then the panel shows the local preview below.
  const [pooled, setPooled] = useState<PooledPattern[]>([])
  useEffect(() => {
    let alive = true
    readAggregatePatterns(AGGREGATE_FLOOR)
      .then((p) => alive && setPooled(p))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

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

  // Connected metrics — the live channel actuals (GA4 / Search Console) for the active brand, pulled
  // from the analytics feed. Brand-level (not asset-derived), so it renders even with zero assets.
  const activeBrand = !allClients && clientFilter !== 'all' ? clientFilter : null
  const actuals = activeBrand ? brandActuals[activeBrand] : undefined
  const fmtN = (n: number) => Math.round(n).toLocaleString()
  const connected =
    actuals && actuals.channels.length > 0 ? (
      <section className="ins-card ins-wide">
        <div className="ins-card-head">
          <h3>Connected metrics</h3>
          <span className="ins-card-hint">
            Live from {(actuals.sources ?? [actuals.source]).filter(Boolean).join(', ')} · last 90 days
          </span>
        </div>
        <div className="ins-rows">
          {actuals.channels.map((c) => {
            const meta = [
              c.clicks != null ? `${fmtN(c.clicks)} clicks` : null,
              c.engagement != null ? `${fmtN(c.engagement)} engaged` : null,
              c.conversions ? `${fmtN(c.conversions)} conversions` : null,
              c.revenue ? money(c.revenue) : null,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <div className="ins-row" key={c.channel}>
                <div className="ins-row-label">
                  <span className="ins-row-name">{c.label}</span>
                  {meta && <span className="ins-row-meta">{meta}</span>}
                </div>
                <span className="ins-row-value">
                  {fmtN(c.reach)} {c.reachUnit}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    ) : null

  if (view.length === 0) {
    return (
      <div className="sheet-grid">
        <div className="ins">
          {connected}
          <div className="ins-empty">
            {connected
              ? 'No content analytics yet. The connected metrics above are live; per-message and per-audience breakdowns fill in as you publish.'
              : 'No assets in scope. Load sample or widen the breadcrumb.'}
          </div>
        </div>
      </div>
    )
  }

  const maxRtb = Math.max(1, ...ins.rtbRoi.map((r) => r.revenue))
  const maxStageRev = Math.max(1, ...ins.stages.map((s) => s.revenue))
  const maxStageAssets = Math.max(1, ...ins.stages.map((s) => s.assets))
  const maxChan = Math.max(1, ...ins.channels.map((c) => Math.max(c.revenue, c.leads * 1)))
  // Organic brands have engagement but no revenue attribution — lead with whichever metric is live.
  const hasRevenue = ins.kpis.revenue > 0
  const maxRtbEng = Math.max(1, ...ins.rtbRoi.map((r) => r.engagement))
  const maxChanEng = Math.max(1, ...ins.channels.map((c) => c.engagement))
  const eng = (n: number) => n.toLocaleString()

  const onIcpRev = ins.icp.onIcp.revenue
  const flaggedRev = ins.icp.flagged.revenue

  return (
    <div className="sheet-grid">
      <div className="ins">
        {connected}
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
            <span className="ins-kpi-label">Engagement</span>
            <span className="ins-kpi-value">{eng(ins.kpis.engagement)}</span>
            <span className="ins-kpi-sub">likes + comments</span>
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

          {/* Journeys by audience over time — which campaign won each audience, by quarter */}
          <section className="ins-card ins-wide">
            <div className="ins-card-head">
              <h3>Journeys by audience over time</h3>
              <span className="ins-card-hint">
                The campaign that drove the most measured outcome for each audience, by quarter. ⭐ marks a repeat winner.
              </span>
            </div>
            {!journeyLearning.hasData ? (
              <div className="jl-empty">
                No measured performance yet. Once posted assets carry channel metrics, the winning journey per audience shows here quarter by quarter.
              </div>
            ) : (
              <div className="jl-scroll">
                <table className="jl-table">
                  <thead>
                    <tr>
                      <th className="jl-th-aud">Audience</th>
                      {journeyLearning.buckets.slice(-5).map((b) => (
                        <th key={b}>{b}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {journeyLearning.audiences.slice(0, 6).map((a) => (
                      <tr key={a.audience}>
                        <td className="jl-aud">
                          {a.audience}
                          {a.winner && (
                            <span
                              className="jl-star"
                              title={`Repeat winner: "${shortCampaign(a.winner.campaign)}" led ${a.winner.bucketsWon} quarters`}
                            >
                              {' '}⭐
                            </span>
                          )}
                        </td>
                        {journeyLearning.buckets.slice(-5).map((b) => {
                          const top = a.perBucket[b]?.[0]
                          return (
                            <td key={b} className="jl-cell">
                              {top ? (
                                <>
                                  <span className="jl-camp" title={`${shortCampaign(top.campaign)} · ${top.assets} asset${top.assets === 1 ? '' : 's'}`}>
                                    {shortCampaign(top.campaign)}
                                  </span>
                                  <span className="jl-val">{Math.round(top.value).toLocaleString()}</span>
                                </>
                              ) : (
                                <span className="jl-none">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Aggregate learning layer — anonymized, cross-customer, floor-gated */}
          <section className="ins-card ins-wide agg">
            <div className="ins-card-head">
              <h3>Aggregate patterns (cross-customer)</h3>
              <span className="ins-card-hint">
                {pooled.length > 0 ? 'Live cross-customer pool · ' : ''}
                Anonymized learnings: which attributes drive outcomes by audience, across customers
              </span>
            </div>

            {!aggregate.contributing ? (
              <div className="ins-note">
                This account is opted out of the aggregate layer. It neither contributes data nor
                reads cross-customer patterns. Per-customer data above is unaffected.
              </div>
            ) : pooled.length > 0 ? (
              <div className="ins-rows">
                {pooled.slice(0, 8).map((p) => (
                  <div className="ins-row" key={`pool:${p.dimension}:${p.archetype}:${p.attribute}`}>
                    <div className="ins-row-label">
                      <span className="ins-row-name">
                        {p.attribute} → {p.archetype}
                      </span>
                      <span className="ins-row-meta">
                        {DIMENSION_LABEL[p.dimension as PatternDimension] ?? p.dimension} · {p.customers} customers ·{' '}
                        {p.variants} variants
                      </span>
                    </div>
                    <span className="ins-row-value">{money(p.outcome)}/variant</span>
                  </div>
                ))}
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
              <h3>Proof-point performance</h3>
              <span className="ins-card-hint">
                {hasRevenue ? 'Revenue' : 'Engagement'} credited to each claim's RTB
              </span>
            </div>
            <div className="ins-rows">
              {ins.rtbRoi.map((r) => (
                <div className="ins-row" key={`${r.campaign}::${r.id}`}>
                  <div className="ins-row-label">
                    <span className="ins-row-name">{r.label}</span>
                    <span className="ins-row-meta">
                      {r.campaign} · {r.assets} asset{r.assets === 1 ? '' : 's'}
                      {!hasRevenue && r.engagement > 0 ? ` · ${eng(r.engagement)} eng` : ''}
                    </span>
                  </div>
                  <Bar value={hasRevenue ? r.revenue : r.engagement} max={hasRevenue ? maxRtb : maxRtbEng} />
                  <span className={`ins-row-value${(hasRevenue ? r.revenue : r.engagement) === 0 ? ' zero' : ''}`}>
                    {hasRevenue ? (r.revenue > 0 ? money(r.revenue) : 'no revenue') : r.engagement > 0 ? eng(r.engagement) : '—'}
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
              <span className="ins-card-hint">{hasRevenue ? 'Revenue & leads' : 'Engagement'} by channel</span>
            </div>
            <div className="ins-rows">
              {ins.channels.map((c) => (
                <div className="ins-row" key={c.channel}>
                  <div className="ins-row-label">
                    <span className="ins-row-name">{c.label}</span>
                    <span className="ins-row-meta">
                      {c.assets} asset{c.assets === 1 ? '' : 's'}
                      {hasRevenue ? ` · ${c.leads} lead${c.leads === 1 ? '' : 's'}` : c.engagement > 0 ? ` · ${eng(c.engagement)} eng` : ''}
                      {c.spend > 0 ? ` · ${money(c.spend)} spend` : ''}
                    </span>
                  </div>
                  <Bar value={hasRevenue ? c.revenue : c.engagement} max={hasRevenue ? maxChan : maxChanEng} />
                  <span className={`ins-row-value${(hasRevenue ? c.revenue : c.engagement) === 0 ? ' zero' : ''}`}>
                    {hasRevenue ? (c.revenue > 0 ? money(c.revenue) : '—') : c.engagement > 0 ? eng(c.engagement) : '—'}
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
