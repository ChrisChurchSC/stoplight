import { useMemo, useState } from 'react'
import { campaignFlight } from '../domain/campaignWindow'
import { formatReach, journeyPerformance } from '../domain/journeyPerf'
import { STATUS_LABEL } from '../domain/lifecycle'
import { useHomeCanvases, type CanvasCard } from '../lib/useHomeCanvases'
import { DRAFTS_SPACE, useTrafficStore } from '../store/useTrafficStore'

/**
 * The Cockpit — a marketing director's cross-brand home. Every campaign in the
 * portfolio on one board: status, pacing (from the flight window), calibrated
 * projected reach, and the triage flags that say what's off track. Sorts by risk
 * first (the director's real question, "what needs me?"), then soonest / reach /
 * recent. A row opens that campaign's canvas. Reads the shared canvas computation
 * and the same lifecycle triage the per-brand home uses, scoped to everything.
 */

type Sort = 'risk' | 'soonest' | 'reach' | 'recent'
const SORTS: { key: Sort; label: string }[] = [
  { key: 'risk', label: 'Risk' },
  { key: 'soonest', label: 'Soonest' },
  { key: 'reach', label: 'Reach' },
  { key: 'recent', label: 'Recent' },
]

const DAY = 86_400_000
const MNAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDay = (ms: number) => {
  const d = new Date(ms)
  return `${MNAMES[d.getMonth()]} ${d.getDate()}`
}
const severityWeight = (s: 'high' | 'medium' | 'low') => (s === 'high' ? 100 : s === 'medium' ? 10 : 1)

interface CockpitRow {
  card: CanvasCard
  brand: string
  shortName: string
  reach: number
  posted: number
  start: number | null
  end: number | null
  risk: number
}

export function PortfolioCockpit() {
  const { canvases } = useHomeCanvases()
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)
  const setView = useTrafficStore((s) => s.setView)
  const setPage = useTrafficStore((s) => s.setPage)

  const [sort, setSort] = useState<Sort>('risk')
  const [brandFilter, setBrandFilter] = useState('all')
  const now = Date.now()

  const rows = useMemo<CockpitRow[]>(
    () =>
      canvases
        .filter((c) => c.client && c.client !== DRAFTS_SPACE)
        .map((c) => {
          const flight = campaignFlight(c.name, c.rows)
          const shortName = c.name.startsWith(`${c.client} — `) ? c.name.slice(c.client.length + 3) : c.name
          return {
            card: c,
            brand: c.client,
            shortName,
            reach: journeyPerformance(c.rows).plan.topReach,
            posted: c.rows.filter((r) => r.status === 'posted').length,
            start: flight?.start ?? null,
            end: flight?.end ?? null,
            risk: c.attention.flags.reduce((a, f) => a + severityWeight(f.severity), 0),
          }
        }),
    [canvases],
  )

  const brands = useMemo(() => [...new Set(rows.map((r) => r.brand))].sort(), [rows])
  const shown = rows.filter((r) => brandFilter === 'all' || r.brand === brandFilter)

  const sorted = [...shown].sort((a, b) => {
    if (sort === 'reach') return b.reach - a.reach
    if (sort === 'recent') return b.card.lastTouched - a.card.lastTouched
    if (sort === 'soonest') return (a.start ?? Infinity) - (b.start ?? Infinity)
    return b.risk - a.risk || (a.start ?? Infinity) - (b.start ?? Infinity)
  })

  const needAttention = shown.filter((r) => r.card.attention.count > 0).length
  const live = shown.filter((r) => r.card.status === 'active').length
  const launching = shown.filter((r) => r.start != null && r.start >= now && r.start <= now + 7 * DAY).length
  const totalReach = shown.reduce((a, r) => a + r.reach, 0)

  const open = (r: CockpitRow) => {
    setClientFilter(r.brand)
    setCampaignFilter(r.card.name)
    setView('canvas')
    setPage('clients')
  }

  const pacing = (r: CockpitRow): { label: string; cls: string } => {
    if (r.start == null || r.end == null) return { label: 'undated', cls: 'undated' }
    if (r.end < now) return { label: 'ended', cls: 'ended' }
    if (r.start > now) {
      const days = Math.ceil((r.start - now) / DAY)
      return { label: days <= 0 ? 'today' : `in ${days}d`, cls: 'upcoming' }
    }
    const pct = Math.round(((now - r.start) / Math.max(1, r.end - r.start)) * 100)
    return { label: `live · ${pct}%`, cls: 'live' }
  }

  const KPIS = [
    { label: 'Campaigns', value: String(shown.length), sub: `${brands.length} brand${brands.length === 1 ? '' : 's'}` },
    { label: 'Need attention', value: String(needAttention), sub: 'open flags' },
    { label: 'Live now', value: String(live), sub: 'active campaigns' },
    { label: 'Launching ≤7d', value: String(launching), sub: 'starting this week' },
    { label: 'Projected reach', value: formatReach(totalReach), sub: 'portfolio, calibrated' },
  ]

  return (
    <div className="ckpt">
      <header className="ckpt-head">
        <div>
          <h1 className="ckpt-title">Cockpit</h1>
          <p className="ckpt-sub">
            {shown.length} campaign{shown.length === 1 ? '' : 's'} across {brands.length} brand
            {brands.length === 1 ? '' : 's'}
            {needAttention > 0 ? ` · ${needAttention} need${needAttention === 1 ? 's' : ''} attention` : ' · all healthy'}
          </p>
        </div>
        <div className="ckpt-controls">
          <div className="ckpt-sorts">
            {SORTS.map((s) => (
              <button key={s.key} className={`ckpt-sort${sort === s.key ? ' active' : ''}`} onClick={() => setSort(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
          {brands.length > 1 && (
            <select className="ckpt-brand" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
              <option value="all">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <div className="ins-kpis ckpt-kpis">
        {KPIS.map((k) => (
          <div className="ins-kpi" key={k.label}>
            <span className="ins-kpi-label">{k.label}</span>
            <span className="ins-kpi-value">{k.value}</span>
            <span className="ins-kpi-sub">{k.sub}</span>
          </div>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="ckpt-empty">No campaigns yet. Build one from a brand to see it here.</div>
      ) : (
        <div className="ckpt-table">
          <div className="ckpt-tr ckpt-head-row">
            <span>Campaign</span>
            <span>Brand</span>
            <span>Status</span>
            <span>Window</span>
            <span className="ckpt-r">Proj. reach</span>
            <span className="ckpt-r">Assets</span>
            <span>Risk</span>
          </div>
          {sorted.map((r) => {
            const p = pacing(r)
            return (
              <div
                className="ckpt-tr"
                key={r.card.name}
                role="button"
                tabIndex={0}
                onClick={() => open(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') open(r)
                }}
              >
                <span className="ckpt-name" title={r.card.name}>
                  {r.shortName}
                </span>
                <span className="ckpt-brandcell">{r.brand}</span>
                <span>
                  <span className={`pill s-${r.card.status}`}>{STATUS_LABEL[r.card.status]}</span>
                </span>
                <span className="ckpt-win">
                  <span className={`ckpt-pace p-${p.cls}`}>{p.label}</span>
                  {r.start != null && r.end != null && (
                    <span className="ckpt-dates">
                      {fmtDay(r.start)} – {fmtDay(r.end)}
                    </span>
                  )}
                </span>
                <span className="ckpt-r ckpt-reach">{formatReach(r.reach)}</span>
                <span className="ckpt-r">
                  {r.posted}/{r.card.rows.length}
                </span>
                <span className="ckpt-risk">
                  {r.card.attention.count === 0 ? (
                    <span className="ckpt-ok">✓ healthy</span>
                  ) : (
                    r.card.attention.flags.map((f) => (
                      <span key={f.kind} className={`flag k-${f.kind} sev-${f.severity}`}>
                        {f.label}
                      </span>
                    ))
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
