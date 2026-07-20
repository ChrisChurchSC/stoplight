import { useMemo } from 'react'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import type { CampaignStatus } from '../domain/lifecycle'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * A high-level campaign calendar: every one of the brand's campaigns as a horizontal bar on a shared
 * month timeline, so you can see at a glance what is running, when, and for how long. Each campaign's
 * flight window is derived from its scheduled assets (earliest to latest scheduledAt), extended to its
 * planned duration when longer. Bars are colored by lifecycle status; a "today" line marks now.
 * Clicking a bar opens that campaign (openFlow → the Flows canvas). Campaigns with nothing scheduled
 * yet are listed underneath so they aren't lost.
 */

const DAY = 86_400_000

const STATUS_COLOR: Record<CampaignStatus, string> = {
  active: 'var(--green, #1f9d55)',
  planning: 'var(--blue, #2563eb)',
  'in-review': 'var(--amber, #d97706)',
  completed: 'var(--text-faint, #8a969b)',
}
const STATUS_LABEL: Record<CampaignStatus, string> = {
  active: 'Active',
  planning: 'Planning',
  'in-review': 'In review',
  completed: 'Completed',
}

const firstOfMonth = (ms: number) => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}
const nextMonth = (ms: number) => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
}

export function CampaignCalendar() {
  const { canvases } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const openFlow = useTrafficStore((s) => s.openFlow)
  const brand = clientFilter && clientFilter !== 'all' ? clientFilter : ''

  const durByName = useMemo(
    () => new Map(campaignList.map((c) => [c.name, c.durationWeeks] as const)),
    [campaignList],
  )

  // The brand's campaigns with a derived flight window from their scheduled assets.
  const items = useMemo(() => {
    const forBrand = canvases.filter((c) => (brand ? c.client === brand : true) && c.name !== CONTENT_LIBRARY_CAMPAIGN)
    return forBrand.map((c) => {
      const times = c.rows.map((r) => Date.parse(r.scheduledAt)).filter((t) => !Number.isNaN(t))
      const start = times.length ? Math.min(...times) : NaN
      let end = times.length ? Math.max(...times) : NaN
      const dur = durByName.get(c.name)
      if (!Number.isNaN(start) && dur && dur > 0 && end - start < dur * 7 * DAY) end = start + dur * 7 * DAY
      return {
        name: c.name,
        status: c.status as CampaignStatus,
        start,
        end,
        assetCount: c.rows.length,
        scheduled: times.length,
      }
    })
  }, [canvases, brand, durByName])

  const scheduled = useMemo(
    () => items.filter((i) => !Number.isNaN(i.start)).sort((a, b) => a.start - b.start || a.name.localeCompare(b.name)),
    [items],
  )
  const unscheduled = items.filter((i) => Number.isNaN(i.start))

  // Timeline range: snapped to whole months, spanning the earliest start to the latest end, with a
  // floor of ~4 months around today so a single short campaign still reads on a real calendar.
  const now = Date.now()
  const { rangeStart, span, months } = useMemo(() => {
    const starts = scheduled.map((i) => i.start)
    const ends = scheduled.map((i) => i.end)
    const lo = firstOfMonth(starts.length ? Math.min(...starts, now) : now)
    let hi = ends.length ? Math.max(...ends, now) : now
    hi = nextMonth(hi)
    // Always show at least 12 months out from the current month; extend further when campaigns run
    // beyond that so a long flight is never clipped.
    const nd = new Date(now)
    const twelveOut = new Date(nd.getFullYear(), nd.getMonth() + 12, 1).getTime()
    if (hi < twelveOut) hi = twelveOut
    const ms: { label: string; start: number; days: number }[] = []
    for (let m = lo; m < hi; ) {
      const nxt = nextMonth(m)
      ms.push({
        label: new Date(m).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        start: m,
        days: (nxt - m) / DAY,
      })
      m = nxt
    }
    return { rangeStart: lo, span: hi - lo, months: ms }
  }, [scheduled, now])

  const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - rangeStart) / span) * 100))
  const todayPct = pct(now)

  if (!items.length) {
    return (
      <div className="ccal">
        <header className="ccal-head">
          <h1 className="ccal-title">Calendar</h1>
          <p className="ccal-sub">No campaigns yet for {brand || 'this brand'}. Build one and it shows up here on the timeline.</p>
        </header>
      </div>
    )
  }

  return (
    <div className="ccal">
      <header className="ccal-head">
        <div>
          <h1 className="ccal-title">Calendar</h1>
          <p className="ccal-sub">
            {scheduled.length} scheduled campaign{scheduled.length === 1 ? '' : 's'} for {brand || 'this brand'}
            {unscheduled.length ? ` · ${unscheduled.length} not scheduled yet` : ''}
          </p>
        </div>
        <div className="ccal-legend">
          {(Object.keys(STATUS_LABEL) as CampaignStatus[]).map((s) => (
            <span key={s} className="ccal-legend-item">
              <span className="ccal-legend-dot" style={{ background: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </header>

      <div className="ccal-chart">
        {/* Timeline header: the task column heading + the month scale. */}
        <div className="ccal-chart-head">
          <div className="ccal-label-col ccal-label-head">Campaign</div>
          <div className="ccal-track ccal-scale">
            {months.map((m) => (
              <div key={m.start} className="ccal-monthcell" style={{ left: `${pct(m.start)}%`, width: `${(m.days / (span / DAY)) * 100}%` }}>
                <span className="ccal-monthcell-label">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ccal-body">
          {scheduled.map((c) => {
            const left = pct(c.start)
            const width = Math.max(1.5, pct(c.end) - left)
            const short = c.name.replace(`${brand} — `, '')
            // Under an umbrella the children share a prefix ("Series · Audience"); show the
            // distinguishing tail so rows don't all read identically. Full name stays in the tooltip.
            const display = short.includes(' · ') ? short.split(' · ').slice(1).join(' · ') : short
            return (
              <div className="ccal-row" key={c.name}>
                <div className="ccal-label-col">
                  <span className="ccal-dot" style={{ background: STATUS_COLOR[c.status] }} aria-hidden="true" />
                  <span className="ccal-row-name" title={short}>
                    {display}
                  </span>
                  <span className="ccal-row-count">{c.assetCount}</span>
                </div>
                <div className="ccal-track">
                  {/* Continuous month gridlines + today marker, full lane height (Gantt grid). */}
                  {months.map((m) => (
                    <div key={m.start} className="ccal-gridline" style={{ left: `${pct(m.start)}%` }} />
                  ))}
                  {todayPct > 0 && todayPct < 100 && <div className="ccal-today" style={{ left: `${todayPct}%` }} />}
                  <button
                    className="ccal-bar"
                    style={{ left: `${left}%`, width: `${width}%`, background: STATUS_COLOR[c.status] }}
                    onClick={() => openFlow(c.name)}
                    title={`${short} · ${STATUS_LABEL[c.status]} · ${c.assetCount} asset${c.assetCount === 1 ? '' : 's'}`}
                  >
                    <span className="ccal-bar-label">{display}</span>
                  </button>
                  {/* Asset count trailing the bar, so it reads on the timeline itself. */}
                  <span className="ccal-bar-count" style={{ left: `calc(${left + width}% + 6px)` }} aria-hidden="true">
                    {c.assetCount} asset{c.assetCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className="ccal-unsched">
          <div className="ccal-unsched-h">Not scheduled yet</div>
          <div className="ccal-unsched-list">
            {unscheduled.map((c) => (
              <button key={c.name} className="ccal-unsched-item" onClick={() => openFlow(c.name)}>
                <span className="ccal-dot" style={{ background: STATUS_COLOR[c.status] }} aria-hidden="true" />
                {c.name.replace(`${brand} — `, '')}
                <span className="ccal-row-count">{c.assetCount}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
