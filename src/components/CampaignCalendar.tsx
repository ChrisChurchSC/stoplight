import { Fragment, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import type { CampaignStatus } from '../domain/lifecycle'
import type { ChannelId } from '../domain/types'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

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
  const moveCampaignSchedule = useTrafficStore((s) => s.moveCampaignSchedule)
  const rescaleCampaignSchedule = useTrafficStore((s) => s.rescaleCampaignSchedule)
  const moveAssetSchedule = useTrafficStore((s) => s.moveAssetSchedule)
  const brand = clientFilter && clientFilter !== 'all' ? clientFilter : ''
  // How many months the timeline spans (the view zoom).
  const [viewMonths, setViewMonths] = useState(12)

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
      // Each scheduled asset, for the expandable per-asset rows.
      const assets = c.rows
        .map((r) => ({ id: r.id, name: r.assetName || r.assetType || 'Asset', channel: r.channel, at: Date.parse(r.scheduledAt) }))
        .filter((a) => !Number.isNaN(a.at))
        .sort((a, b) => a.at - b.at)
      return {
        name: c.name,
        status: c.status as CampaignStatus,
        start,
        end,
        assetCount: c.rows.length,
        scheduled: times.length,
        assets,
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
    const lo = firstOfMonth(starts.length ? Math.min(...starts, now) : now)
    // The window spans exactly the selected number of months from the start (the view zoom); campaigns
    // running past the window clamp at the right edge, pick a longer view to see them in full.
    const loD = new Date(lo)
    const hi = new Date(loD.getFullYear(), loD.getMonth() + viewMonths, 1).getTime()
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
  }, [scheduled, now, viewMonths])

  const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - rangeStart) / span) * 100))
  const todayPct = pct(now)

  // Drag to reschedule: grab a bar to MOVE the whole flight, or its edges to RESIZE (duration).
  // Movement snaps to whole WEEKS so reschedules land on clean dates, and a live tooltip shows the
  // resulting flight window. Committed once on drop.
  const LABEL_COL = 220
  const WEEK = 7 * DAY
  // Campaigns expanded to show their individual assets as sub-rows.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpanded = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  const bodyRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<
    { name: string; mode: 'move' | 'resize-l' | 'resize-r'; offsetPx: number; newStart: number; newEnd: number; x: number; y: number } | null
  >(null)
  const dragMovedRef = useRef(false)

  const beginDrag = (e: ReactMouseEvent, c: { name: string; start: number; end: number }, mode: 'move' | 'resize-l' | 'resize-r') => {
    e.preventDefault()
    e.stopPropagation()
    dragMovedRef.current = false
    const startX = e.clientX
    const trackW = bodyRef.current ? bodyRef.current.clientWidth - LABEL_COL : 0
    const totalDays = span / DAY
    // Convert the cursor delta into a whole number of weeks, then back into a snapped window.
    const compute = (clientX: number) => {
      const rawDays = trackW > 0 ? ((clientX - startX) / trackW) * totalDays : 0
      const weeks = Math.round(rawDays / 7)
      const days = weeks * 7
      const offsetPx = trackW > 0 ? (days / totalDays) * trackW : 0
      let newStart: number, newEnd: number
      if (mode === 'move') {
        newStart = c.start + days * DAY
        newEnd = c.end + days * DAY
      } else if (mode === 'resize-r') {
        newStart = c.start
        newEnd = Math.max(c.start + WEEK, c.end + days * DAY)
      } else {
        newStart = Math.min(c.end - WEEK, c.start + days * DAY)
        newEnd = c.end
      }
      return { days, offsetPx, newStart, newEnd }
    }
    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 3) dragMovedRef.current = true
      const r = compute(ev.clientX)
      setDrag({ name: c.name, mode, offsetPx: r.offsetPx, newStart: r.newStart, newEnd: r.newEnd, x: ev.clientX, y: ev.clientY })
    }
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const r = compute(ev.clientX)
      if (r.days !== 0) {
        if (mode === 'move') void moveCampaignSchedule(c.name, r.days)
        else void rescaleCampaignSchedule(c.name, r.newStart, r.newEnd)
      }
      setDrag(null)
      // Keep the "moved" flag through this tick so the bar's click doesn't also open the campaign.
      window.setTimeout(() => {
        dragMovedRef.current = false
      }, 0)
    }
    setDrag({ name: c.name, mode, offsetPx: 0, newStart: c.start, newEnd: c.end, x: e.clientX, y: e.clientY })
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  // Drag a single asset's marker to change its launch date (snapped to whole DAYS for precision).
  const [assetDrag, setAssetDrag] = useState<{ id: string; offsetPx: number; newAt: number; x: number; y: number } | null>(null)
  const assetMovedRef = useRef(false)

  const beginAssetDrag = (e: ReactMouseEvent, a: { id: string; at: number }) => {
    e.preventDefault()
    e.stopPropagation()
    assetMovedRef.current = false
    const startX = e.clientX
    const trackW = bodyRef.current ? bodyRef.current.clientWidth - LABEL_COL : 0
    const totalDays = span / DAY
    const compute = (clientX: number) => {
      const rawDays = trackW > 0 ? ((clientX - startX) / trackW) * totalDays : 0
      const days = Math.round(rawDays)
      const offsetPx = trackW > 0 ? (days / totalDays) * trackW : 0
      return { days, offsetPx, newAt: a.at + days * DAY }
    }
    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 3) assetMovedRef.current = true
      const r = compute(ev.clientX)
      setAssetDrag({ id: a.id, offsetPx: r.offsetPx, newAt: r.newAt, x: ev.clientX, y: ev.clientY })
    }
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const r = compute(ev.clientX)
      if (r.days !== 0) void moveAssetSchedule(a.id, r.days)
      setAssetDrag(null)
      window.setTimeout(() => {
        assetMovedRef.current = false
      }, 0)
    }
    setAssetDrag({ id: a.id, offsetPx: 0, newAt: a.at, x: e.clientX, y: e.clientY })
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

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
        <div className="ccal-range" role="group" aria-label="Timeline range">
          {[3, 6, 9, 12].map((n) => (
            <button key={n} className={`ccal-range-btn${viewMonths === n ? ' on' : ''}`} onClick={() => setViewMonths(n)}>
              {n} mo
            </button>
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

        <div className="ccal-body" ref={bodyRef}>
          {scheduled.map((c) => {
            const left = pct(c.start)
            const width = Math.max(1.5, pct(c.end) - left)
            const d = drag?.name === c.name ? drag : null
            // Live preview of the drag: shift/grow the bar by the week-snapped pixel offset before it commits.
            const barStyle: CSSProperties = { background: STATUS_COLOR[c.status] }
            barStyle.left = d && d.mode !== 'resize-r' ? `calc(${left}% + ${d.offsetPx}px)` : `${left}%`
            barStyle.width =
              d && d.mode === 'resize-r'
                ? `calc(${width}% + ${d.offsetPx}px)`
                : d && d.mode === 'resize-l'
                  ? `calc(${width}% - ${d.offsetPx}px)`
                  : `${width}%`
            const countShift = d && d.mode !== 'resize-l' ? d.offsetPx : 0
            const short = c.name.replace(`${brand} — `, '')
            // Under an umbrella the children share a prefix ("Series · Audience"); show the
            // distinguishing tail so rows don't all read identically. Full name stays in the tooltip.
            const display = short.includes(' · ') ? short.split(' · ').slice(1).join(' · ') : short
            const isExp = expanded.has(c.name)
            return (
              <Fragment key={c.name}>
              <div className="ccal-row">
                <div className="ccal-label-col">
                  {c.assets.length > 0 ? (
                    <button
                      className={`ccal-caret${isExp ? ' open' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleExpanded(c.name)
                      }}
                      aria-label={isExp ? 'Hide assets' : 'Show assets'}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  ) : (
                    <span className="ccal-caret-spacer" aria-hidden="true" />
                  )}
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
                    className={`ccal-bar${d ? ' dragging' : ''}`}
                    style={barStyle}
                    onMouseDown={(e) => beginDrag(e, c, 'move')}
                    onClick={() => {
                      if (!dragMovedRef.current) openFlow(c.name)
                    }}
                    title={`${short} · ${STATUS_LABEL[c.status]} · ${c.assetCount} asset${c.assetCount === 1 ? '' : 's'} · drag to move, edges to resize`}
                  >
                    <span
                      className="ccal-bar-handle ccal-bar-handle-l"
                      onMouseDown={(e) => beginDrag(e, c, 'resize-l')}
                      aria-hidden="true"
                    />
                    <span className="ccal-bar-label">{display}</span>
                    <span
                      className="ccal-bar-handle ccal-bar-handle-r"
                      onMouseDown={(e) => beginDrag(e, c, 'resize-r')}
                      aria-hidden="true"
                    />
                  </button>
                  {/* Asset count trailing the bar, so it reads on the timeline itself. */}
                  <span className="ccal-bar-count" style={{ left: `calc(${left + width}% + ${countShift + 6}px)` }} aria-hidden="true">
                    {c.assetCount} asset{c.assetCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              {/* Expanded: each asset as its own sub-row, marked at its scheduled date. */}
              {isExp &&
                c.assets.map((a) => (
                  <div className="ccal-row ccal-asset-row" key={a.id}>
                    <div className="ccal-label-col ccal-asset-label">
                      <span className="ccal-asset-ico">
                        <ChannelIcon channel={a.channel as ChannelId} size={12} />
                      </span>
                      <span className="ccal-row-name" title={a.name}>
                        {a.name}
                      </span>
                    </div>
                    <div className="ccal-track">
                      {months.map((m) => (
                        <div key={m.start} className="ccal-gridline" style={{ left: `${pct(m.start)}%` }} />
                      ))}
                      {todayPct > 0 && todayPct < 100 && <div className="ccal-today" style={{ left: `${todayPct}%` }} />}
                      {(() => {
                        const ad = assetDrag?.id === a.id ? assetDrag : null
                        const off = ad ? ad.offsetPx : 0
                        return (
                          <>
                            <button
                              className={`ccal-asset-marker${ad ? ' dragging' : ''}`}
                              style={{ left: `calc(${pct(a.at)}% + ${off}px)`, background: STATUS_COLOR[c.status] }}
                              onMouseDown={(e) => beginAssetDrag(e, a)}
                              onClick={() => {
                                if (!assetMovedRef.current) openFlow(c.name)
                              }}
                              title={`${a.name} · ${fmtDate(a.at)} · drag to change the launch date`}
                            />
                            <span className="ccal-asset-date" style={{ left: `calc(${pct(a.at)}% + ${off + 12}px)` }} aria-hidden="true">
                              {fmtDate(ad ? ad.newAt : a.at)}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                ))}
              </Fragment>
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

      {/* Live tooltip following the cursor while dragging — the flight window (campaign) or launch
          date (asset) it will land on. Fixed-positioned so it escapes the chart's clipping. */}
      {(drag || assetDrag) && (
        <div className="ccal-drag-tip" style={{ left: (drag ?? assetDrag)!.x + 14, top: (drag ?? assetDrag)!.y - 34 }}>
          {drag ? `${fmtDate(drag.newStart)} - ${fmtDate(drag.newEnd)}` : fmtDate(assetDrag!.newAt)}
        </div>
      )}
    </div>
  )
}
