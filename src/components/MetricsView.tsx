import { money } from '../domain/budget'
import { computeInsights } from '../domain/insights'
import { formatReach, journeyPerformance } from '../domain/journeyPerf'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Metrics — a brand folder's projected/actual rollup across every canvas in it.
 * A fourth way to look at the folder, alongside Canvases / Grid / Calendar. Two
 * truths sit together: the PROJECTED plan (reach + funnel from the plan model,
 * the same one the calendar Plan bar reads) and the ACTUAL to date (spend,
 * attributed revenue, engagement, posts — real once canvases go live). The
 * per-canvas table ranks canvases by projected reach. Reuses the same domain the
 * per-canvas Insights view uses, scoped to the whole brand.
 */

const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const num = (n: number) => n.toLocaleString()

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  'in-review': 'In review',
  active: 'Active',
  completed: 'Completed',
}

function Bar({ value, max }: { value: number; max: number }) {
  const p = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="ins-bar">
      <div className="ins-bar-fill" style={{ width: `${p}%` }} />
    </div>
  )
}

export function MetricsView({ scopeClient }: { scopeClient?: string }) {
  const { canvases } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const comments = useTrafficStore((s) => s.comments)

  const brand = scopeClient ?? (clientFilter !== 'all' ? clientFilter : null)
  const brandCanvases = brand ? canvases.filter((c) => c.client === brand) : []
  const brandRows = brandCanvases.flatMap((c) => c.rows)

  if (!brand || brandRows.length === 0) {
    return (
      <div className="mtx">
        <div className="mtx-empty">No canvases in this folder yet. Build one to project its metrics.</div>
      </div>
    )
  }

  const opts = { comments, flaggedRowIds: new Set<string>(), hasReview: false }
  const ins = computeInsights(brandRows, opts)
  const jp = journeyPerformance(brandRows)

  const perCanvas = brandCanvases
    .map((c) => {
      const ci = computeInsights(c.rows, opts)
      const cj = journeyPerformance(c.rows)
      return {
        name: c.name,
        status: c.status as string,
        assets: c.rows.length,
        reach: cj.plan.topReach,
        convRate: cj.plan.convRate,
        spend: ci.kpis.spend,
        posted: ci.kpis.posted,
      }
    })
    .sort((a, b) => b.reach - a.reach)

  const statusCounts = brandCanvases.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, {})
  const statusSummary = Object.entries(statusCounts)
    .map(([s, n]) => `${n} ${STATUS_LABEL[s]?.toLowerCase() ?? s}`)
    .join(' · ')

  const maxCanvasReach = Math.max(1, ...perCanvas.map((c) => c.reach))
  const maxStageReach = Math.max(1, ...jp.plan.byStage.map((s) => s.reach))
  const maxChanAssets = Math.max(1, ...ins.channels.map((c) => c.assets))
  const hasSpend = ins.kpis.spend > 0
  const hasRevenue = ins.kpis.revenue > 0

  return (
    <div className="mtx">
      <header className="mtx-head">
        <h2>Metrics</h2>
        <span className="mtx-sub">
          Projected plan and actuals to date across {brandCanvases.length} canvas
          {brandCanvases.length === 1 ? '' : 'es'}
        </span>
      </header>

      {/* Scorecard */}
      <div className="ins-kpis">
        <div className="ins-kpi">
          <span className="ins-kpi-label">Canvases</span>
          <span className="ins-kpi-value">{brandCanvases.length}</span>
          <span className="ins-kpi-sub">{statusSummary || 'no status set'}</span>
        </div>
        <div className="ins-kpi">
          <span className="ins-kpi-label">Assets</span>
          <span className="ins-kpi-value">{ins.kpis.rows}</span>
          <span className="ins-kpi-sub">{ins.kpis.posted} posted</span>
        </div>
        <div className="ins-kpi">
          <span className="ins-kpi-label">Projected reach</span>
          <span className="ins-kpi-value">{formatReach(jp.plan.topReach)}</span>
          <span className="ins-kpi-sub">top of funnel, plan model</span>
        </div>
        <div className="ins-kpi">
          <span className="ins-kpi-label">Projected to conversion</span>
          <span className="ins-kpi-value">{formatReach(jp.plan.toConversion)}</span>
          <span className="ins-kpi-sub">{pct(jp.plan.convRate)} of reach</span>
        </div>
        <div className="ins-kpi">
          <span className="ins-kpi-label">Spend to date</span>
          <span className="ins-kpi-value">{hasSpend ? money(ins.kpis.spend) : '—'}</span>
          <span className="ins-kpi-sub">{hasSpend ? 'synced' : 'set card budgets to project'}</span>
        </div>
        <div className="ins-kpi">
          <span className="ins-kpi-label">Attributed revenue</span>
          <span className="ins-kpi-value">{hasRevenue ? money(ins.kpis.revenue) : '—'}</span>
          <span className="ins-kpi-sub">
            {ins.kpis.roas != null ? `${ins.kpis.roas.toFixed(1)}x ROAS` : 'live once canvases post'}
          </span>
        </div>
      </div>

      <div className="ins-cols">
        {/* Projected funnel */}
        <section className="ins-card">
          <div className="ins-card-head">
            <h3>Projected funnel</h3>
            <span className="ins-card-hint">Reach by stage from the plan model</span>
          </div>
          <div className="ins-rows">
            {jp.plan.byStage.map((s) => (
              <div className="ins-row" key={s.stage}>
                <div className="ins-row-label">
                  <span className="ins-row-name">{s.label}</span>
                  <span className="ins-row-meta">
                    {s.assets} asset{s.assets === 1 ? '' : 's'}
                  </span>
                </div>
                <Bar value={s.reach} max={maxStageReach} />
                <span className="ins-row-value">{formatReach(s.reach)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Actual to date */}
        <section className="ins-card">
          <div className="ins-card-head">
            <h3>Actual to date</h3>
            <span className="ins-card-hint">Live once canvases post and analytics connect</span>
          </div>
          <div className="ins-stats">
            <div className="ins-stat">
              <span>{ins.kpis.posted}</span>posted
            </div>
            <div className="ins-stat">
              <span>{num(ins.kpis.engagement)}</span>engagement
            </div>
            <div className="ins-stat">
              <span>{ins.kpis.leads}</span>leads
            </div>
            <div className="ins-stat">
              <span>{hasRevenue ? money(ins.kpis.revenue) : '—'}</span>revenue
            </div>
          </div>
          {ins.kpis.posted === 0 && (
            <div className="mtx-note">
              Nothing is live yet. Actuals populate as assets move to posted. Connect analytics on the
              Connectors page to pull real reach and engagement.
            </div>
          )}
        </section>

        {/* Per-canvas */}
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>By canvas</h3>
            <span className="ins-card-hint">Ranked by projected reach</span>
          </div>
          <div className="mtx-table">
            <div className="mtx-tr mtx-head-row">
              <span>Canvas</span>
              <span>Status</span>
              <span className="mtx-r">Assets</span>
              <span className="mtx-r">Proj. reach</span>
              <span className="mtx-r">Conv. rate</span>
              <span className="mtx-r">Posted</span>
              <span className="mtx-r">Spend</span>
            </div>
            {perCanvas.map((c) => (
              <div className="mtx-tr" key={c.name}>
                <span className="mtx-name" title={c.name}>
                  {c.name}
                </span>
                <span>
                  <span className={`mtx-status s-${c.status}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                </span>
                <span className="mtx-r">{c.assets}</span>
                <span className="mtx-r mtx-reach">
                  <Bar value={c.reach} max={maxCanvasReach} />
                  {formatReach(c.reach)}
                </span>
                <span className="mtx-r">{pct(c.convRate)}</span>
                <span className="mtx-r">{c.posted}</span>
                <span className="mtx-r">{c.spend > 0 ? money(c.spend) : '—'}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Channel mix */}
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Channel mix</h3>
            <span className="ins-card-hint">Assets and spend by channel</span>
          </div>
          <div className="ins-rows">
            {ins.channels.map((c) => (
              <div className="ins-row" key={c.channel}>
                <div className="ins-row-label">
                  <span className="ins-row-name">{c.label}</span>
                  <span className="ins-row-meta">
                    {c.assets} asset{c.assets === 1 ? '' : 's'}
                    {c.spend > 0 ? ` · ${money(c.spend)} spend` : ''}
                    {c.engagement > 0 ? ` · ${num(c.engagement)} eng` : ''}
                  </span>
                </div>
                <Bar value={c.assets} max={maxChanAssets} />
                <span className="ins-row-value">{c.assets}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mtx-foot">
        Projections use the built-in plan model (reach by channel, deterministic). Set card budgets
        for projected spend and ROAS, and connect analytics on the Connectors page for measured
        actuals.
      </div>
    </div>
  )
}
