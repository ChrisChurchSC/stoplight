import { useMemo, useState } from 'react'
import { performanceAlerts, pacingAlerts, sortAlerts, type Alert } from '../domain/alerts'
import { assetBadge } from '../domain/assetBadge'
import { campaignFlight } from '../domain/campaignWindow'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
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
  const brandActuals = useTrafficStore((s) => s.brandActuals)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)
  const setView = useTrafficStore((s) => s.setView)
  const setPage = useTrafficStore((s) => s.setPage)

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

  // Risk-first: the demoted "all campaigns" table always leads with what's off track,
  // then soonest to launch. (The sort toggle was removed to keep the board focused.)
  const sorted = [...shown].sort((a, b) => b.risk - a.risk || (a.start ?? Infinity) - (b.start ?? Infinity))

  const needAttention = shown.filter((r) => r.card.attention.count > 0).length
  const live = shown.filter((r) => r.card.status === 'active').length
  const launching = shown.filter((r) => r.start != null && r.start >= now && r.start <= now + 7 * DAY).length

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

  // Portfolio alerts: performance (measured WoW) per brand + pacing (launch readiness)
  // per campaign. Both from transparent rules; see domain/alerts.
  const perf: Alert[] = [...new Set(shown.map((r) => r.brand))].flatMap((b) => performanceAlerts(b, brandActuals[b]))
  const pace: Alert[] = pacingAlerts(
    shown.map((r) => ({
      brand: r.brand,
      name: r.card.name,
      label: r.shortName,
      approved: r.card.rows.filter((x) => x.status === 'approved').length,
      total: r.card.rows.length,
      start: r.start,
    })),
    now,
  )
  const alerts = sortAlerts([...perf, ...pace])

  const openCampaign = (brand: string, name: string) => {
    setClientFilter(brand)
    setCampaignFilter(name)
    setView('canvas')
    setPage('clients')
  }
  const open = (r: CockpitRow) => openCampaign(r.brand, r.card.name)

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

  return (
    <div className="ckpt">
      <header className="ckpt-head">
        <div>
          {!embedded && <h1 className="ckpt-title">Cockpit</h1>}
          <p className="ckpt-sub">
            {shown.length} campaign{shown.length === 1 ? '' : 's'} across {brands.length} brand
            {brands.length === 1 ? '' : 's'}
            {needAttention > 0 ? ` · ${needAttention} need${needAttention === 1 ? 's' : ''} attention` : ' · all healthy'}
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

      {alerts.length > 0 ? (
        <div className="ckpt-signals">
          <div className="ckpt-signals-head">
            Needs attention<span className="ckpt-signals-n">{alerts.length}</span>
          </div>
          {alerts.map((a) => {
            const clickable = !!a.campaign
            return (
              <div
                key={a.id}
                className={`ckpt-signal sev-${a.severity}${clickable ? ' clickable' : ''}`}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => openCampaign(a.brand, a.campaign as string) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter') openCampaign(a.brand, a.campaign as string)
                      }
                    : undefined
                }
              >
                <span className="ckpt-sig-dot" />
                <div className="ckpt-sig-body">
                  <div className="ckpt-sig-title">{a.title}</div>
                  <div className="ckpt-sig-detail">{a.detail}</div>
                  <div className="ckpt-sig-rule">
                    {a.brand} · {a.kind} · rule: {a.rule}
                  </div>
                </div>
                {clickable && <span className="ckpt-sig-go">→</span>}
              </div>
            )
          })}
        </div>
      ) : (
        shown.length > 0 && <div className="ckpt-allclear">✓ Nothing needs attention right now.</div>
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

      {shown.length === 0 ? (
        <div className="ckpt-empty">No campaigns yet. Build one from a brand to see it here.</div>
      ) : (
        <div className="ckpt-table">
          <div className="ckpt-allcamps">All campaigns</div>
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
                <span className="ckpt-namecell">
                  <span className="ckpt-name" title={r.card.name}>
                    {r.shortName}
                  </span>
                  {r.card.goal.message || r.card.goal.target != null ? (
                    <span className="ckpt-goal" title={r.card.goal.sentence}>
                      ◎ {r.card.goal.sentence}
                    </span>
                  ) : (
                    <span className="ckpt-goal ckpt-goal-empty">No goal set</span>
                  )}
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
