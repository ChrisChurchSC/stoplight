import { useMemo, useState } from 'react'
import { assetBadge } from '../domain/assetBadge'
import { campaignFlight } from '../domain/campaignWindow'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { journeyPerformance } from '../domain/journeyPerf'
import { useHomeCanvases, type CanvasCard } from '../lib/useHomeCanvases'
import { DRAFTS_SPACE, useTrafficStore } from '../store/useTrafficStore'
import { computePriorities, PriorityList } from './PrioritiesView'
import { HomeHero } from './HomeHero'

/**
 * The Cockpit — a marketing director's cross-brand home. Every campaign in the
 * portfolio on one board: status, pacing (from the flight window), calibrated
 * projected reach, and the triage flags that say what's off track. Sorts by risk
 * first (the director's real question, "what needs me?"), then soonest / reach /
 * recent. A row opens that campaign's canvas. Reads the shared canvas computation
 * and the same lifecycle triage the per-brand home uses, scoped to everything.
 */

const DAY = 86_400_000
const MNAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDay = (ms: number) => {
  const d = new Date(ms)
  return `${MNAMES[d.getMonth()]} ${d.getDate()}`
}
/** Parse a schedule date, reading a bare YYYY-MM-DD as local (UTC would drift a day). */
const parseDue = (iso: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.parse(iso)
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

export function PortfolioCockpit({ embedded }: { embedded?: boolean }) {
  const { canvases } = useHomeCanvases()
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setPage = useTrafficStore((s) => s.setPage)
  const openFlow = useTrafficStore((s) => s.openFlow)
  const brandSystems = useTrafficStore((s) => s.brandSystems)
  const setLibraryMode = useTrafficStore((s) => s.setLibraryMode)
  const pinnedInsights = useTrafficStore((s) => s.pinnedInsights)
  const removePinnedInsight = useTrafficStore((s) => s.removePinnedInsight)

  const [brandFilter, setBrandFilter] = useState('all')
  const now = Date.now()

  const rows = useMemo<CockpitRow[]>(
    () =>
      canvases
        // "Published content" is the library archive, not a campaign to run.
        .filter((c) => c.client && c.client !== DRAFTS_SPACE && c.name !== CONTENT_LIBRARY_CAMPAIGN)
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

  const live = shown.filter((r) => r.card.status === 'active').length
  const launching = shown.filter((r) => r.start != null && r.start >= now && r.start <= now + 7 * DAY).length

  // Priorities: the top-5 high-impact changes for the brand in view (the calm front door,
  // in place of the old alerts list). Scoped to the filtered brand, or the only brand.
  // Insights pinned out of reports, scoped to the selected brand (all when unscoped).
  const pins = pinnedInsights.filter((p) => brandFilter === 'all' || p.client === brandFilter)
  const prioBrand = brandFilter !== 'all' ? brandFilter : brands[0]
  const priorities = useMemo(
    () => (prioBrand ? computePriorities(prioBrand, canvases.filter((c) => c.client === prioBrand).flatMap((c) => c.rows), brandSystems[prioBrand]) : []),
    [prioBrand, canvases, brandSystems],
  )

  // What's due next: not-yet-shipped assets across the shown campaigns, soonest first,
  // at the asset level. Split at today: what's genuinely coming up leads the list, while
  // anything already past its date is rolled into one "overdue" count rather than flooding
  // the view (a director wants the next move, not a pile of stale dates).
  const dayStart = (() => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  })()
  const unposted = shown
    .flatMap((r) =>
      r.card.rows
        .filter((row) => row.status !== 'posted')
        .map((row) => ({ row, brand: r.brand, campaign: r.shortName, campaignName: r.card.name, due: parseDue(row.scheduledAt) })),
    )
    .filter((x) => !Number.isNaN(x.due))
    .sort((a, b) => a.due - b.due)
  const overdueCount = unposted.filter((x) => x.due < dayStart).length
  const upNext = unposted.filter((x) => x.due >= dayStart).slice(0, 7)

  // Campaigns open in Flows now, not the legacy canvas.
  const openCampaign = (_brand: string, name: string) => {
    openFlow(name)
  }

  return (
    <div className="ckpt">
      {embedded && <HomeHero />}
      <header className="ckpt-head">
        <div>
          {!embedded && <h1 className="ckpt-title">Cockpit</h1>}
          <p className="ckpt-sub">
            {shown.length} campaign{shown.length === 1 ? '' : 's'} across {brands.length} brand
            {brands.length === 1 ? '' : 's'}
            {` · ${live} live · ${launching} launching ≤7d`}
          </p>
        </div>
        {brands.length > 1 && (
          <div className="ckpt-controls">
            <select className="ckpt-brand" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
              <option value="all">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {pins.length > 0 && (
        <div className="ckpt-pins">
          <div className="ckpt-pins-head">
            Pinned<span className="ckpt-pins-sub">findings you lifted from reports</span>
          </div>
          <div className="ckpt-pins-list">
            {pins.map((p) => (
              <div key={p.id} className="ckpt-pin">
                <div className="ckpt-pin-body">
                  <div className="ckpt-pin-text">{p.text}</div>
                  {(brandFilter === 'all' || p.sourceTitle) && (
                    <button
                      className="ckpt-pin-src"
                      title="Open the report this came from"
                      onClick={() => {
                        setClientFilter(p.client)
                        setPage('reports')
                      }}
                    >
                      {brandFilter === 'all' ? `${p.client} · ` : ''}
                      {p.sourceTitle ? `from “${p.sourceTitle}”` : 'from a report'}
                    </button>
                  )}
                </div>
                <button
                  className="ckpt-pin-x"
                  title="Unpin"
                  aria-label="Unpin"
                  onClick={() => removePinnedInsight(p.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {priorities.length > 0 && (
        <div className="ckpt-priorities">
          <div className="ckpt-priorities-head">
            Priorities<span className="ckpt-priorities-sub">the top 5 changes to make now, ranked by impact</span>
          </div>
          <PriorityList
            priorities={priorities}
            onGoto={(goto) => {
              if (prioBrand) setClientFilter(prioBrand)
              setLibraryMode(goto)
            }}
          />
        </div>
      )}

      {(upNext.length > 0 || overdueCount > 0) && (
        <div className="ckpt-upnext">
          <div className="ckpt-upnext-head">
            Up next<span className="ckpt-upnext-sub">next assets due</span>
          </div>
          {overdueCount > 0 && (
            <div className="ckpt-due ckpt-due-note">
              <span className="ckpt-due-when w-overdue">{overdueCount} overdue</span>
              <span className="ckpt-due-name ckpt-due-notetext">
                unshipped assets past their scheduled date{upNext.length > 0 ? ', shown below what is coming up' : ''}
              </span>
            </div>
          )}
          {upNext.map(({ row, brand, campaign, campaignName, due }) => {
            const days = Math.ceil((due - now) / DAY)
            const cls = days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'soon' : 'later'
            const when =
              days < 0 ? `overdue ${-days}d` : days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days}d`
            const badge = assetBadge(row)
            return (
              <div
                key={row.id}
                className="ckpt-due"
                role="button"
                tabIndex={0}
                onClick={() => openCampaign(brand, campaignName)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openCampaign(brand, campaignName)
                }}
              >
                <span className={`ckpt-due-when w-${cls}`}>{when}</span>
                <span className="ckpt-due-date">{fmtDay(due)}</span>
                <span className="ckpt-due-name" title={row.assetName}>
                  {row.assetName}
                </span>
                <span className="ckpt-due-camp">
                  {brand} · {campaign}
                </span>
                <span className={`cv-node-badge badge-${badge.kind}`}>{badge.label}</span>
              </div>
            )
          })}
        </div>
      )}

      {shown.length === 0 && (
        <div className="ckpt-empty">No campaigns yet. Build one from a brand to see it here.</div>
      )}
    </div>
  )
}
