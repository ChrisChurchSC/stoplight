import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { flightForRow } from '../domain/flight'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import type { CampaignStatus } from '../domain/lifecycle'
import type { ChannelId } from '../domain/types'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

/**
 * The campaign calendar as a Gantt of FLIGHTS: Umbrella → Campaign (a row) → Flight (a bar) → Asset
 * (a marker). A campaign row shows one bar per flight (a flight is one scheduled run of the campaign);
 * dragging a bar moves/resizes that flight (and reschedules its assets). Expanding a row lists the
 * campaign's assets, each draggable to its own launch date. Bars are colored by lifecycle status.
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
  const flights = useTrafficStore((s) => s.flights)
  const openFlow = useTrafficStore((s) => s.openFlow)
  const ensureFlights = useTrafficStore((s) => s.ensureFlights)
  const moveFlightSchedule = useTrafficStore((s) => s.moveFlightSchedule)
  const rescaleFlightSchedule = useTrafficStore((s) => s.rescaleFlightSchedule)
  const moveAssetSchedule = useTrafficStore((s) => s.moveAssetSchedule)
  const addFlightRun = useTrafficStore((s) => s.addFlightRun)
  const removeFlightRun = useTrafficStore((s) => s.removeFlightRun)
  const rotateAlwaysOn = useTrafficStore((s) => s.rotateAlwaysOn)
  const showToastAction = useTrafficStore((s) => s.showToastAction)
  const patchCampaign = useTrafficStore((s) => s.patchCampaign)
  const showToast = useTrafficStore((s) => s.showToast)
  const brand = clientFilter && clientFilter !== 'all' ? clientFilter : ''
  // How many months the timeline spans (the view zoom).
  const [viewMonths, setViewMonths] = useState(12)

  // Every campaign gets a flight; make sure new ones do too (idempotent + cheap).
  const canvasCount = canvases.length
  useEffect(() => {
    if (canvasCount) void ensureFlights()
  }, [canvasCount, ensureFlights])

  // Each brand campaign with its flight bars (one per flight, window derived from that flight's assets,
  // extended to the flight's planned duration) and its full asset list for the expand.
  const items = useMemo(() => {
    const forBrand = canvases.filter((c) => (brand ? c.client === brand : true) && c.name !== CONTENT_LIBRARY_CAMPAIGN)
    return forBrand.map((c) => {
      const campFlights = flights.filter((f) => f.campaign === c.name)
      const bars = campFlights
        .map((f) => {
          const fRows = c.rows.filter((r) => flightForRow(r, flights)?.id === f.id)
          const times = fRows.map((r) => Date.parse(r.scheduledAt)).filter((t) => !Number.isNaN(t))
          const start = times.length ? Math.min(...times) : Date.parse(f.startAt)
          let end = times.length ? Math.max(...times) : start
          const durMs = (f.durationWeeks || 4) * 7 * DAY
          if (end - start < durMs) end = start + durMs
          return { id: f.id, name: f.name, start, end, assetCount: fRows.length }
        })
        .filter((b) => !Number.isNaN(b.start))
      // Fallback for the brief window before ensureFlights runs (or a campaign with no flight yet):
      // a single synthetic, non-draggable bar derived from all assets.
      if (!bars.length) {
        const times = c.rows.map((r) => Date.parse(r.scheduledAt)).filter((t) => !Number.isNaN(t))
        if (times.length) bars.push({ id: '', name: 'Flight 1', start: Math.min(...times), end: Math.max(...times), assetCount: c.rows.length })
      }
      // Assets in the campaign's natural order (NOT date-sorted) so a drag never reshuffles the list.
      const assets = c.rows
        .map((r) => ({ id: r.id, name: r.assetName || r.assetType || 'Asset', channel: r.channel, at: Date.parse(r.scheduledAt) }))
        .filter((a) => !Number.isNaN(a.at))
      const start = bars.length ? Math.min(...bars.map((b) => b.start)) : NaN
      return { name: c.name, status: c.status as CampaignStatus, start, assetCount: c.rows.length, bars, assets, timing: c.timing, refreshWeeks: c.refreshWeeks }
    })
  }, [canvases, brand, flights])

  const scheduled = useMemo(
    () => items.filter((i) => !Number.isNaN(i.start)).sort((a, b) => a.start - b.start || a.name.localeCompare(b.name)),
    [items],
  )
  const unscheduled = items.filter((i) => Number.isNaN(i.start))
  // Discrete campaigns first (dated blocks), then perpetual always-on streams under their own
  // subheading — an evergreen stream has no end date, so it reads differently from a dated campaign.
  const alwaysOnRows = scheduled.filter((i) => i.timing === 'always-on')
  const discreteRows = scheduled.filter((i) => i.timing !== 'always-on')
  const orderedRows = [...discreteRows, ...alwaysOnRows]

  // Timeline range: whole months from the earliest start, spanning exactly the selected view (zoom).
  const now = Date.now()
  const { rangeStart, span, months } = useMemo(() => {
    const starts = scheduled.map((i) => i.start)
    const lo = firstOfMonth(starts.length ? Math.min(...starts, now) : now)
    const loD = new Date(lo)
    const hi = new Date(loD.getFullYear(), loD.getMonth() + viewMonths, 1).getTime()
    const ms: { label: string; start: number; days: number }[] = []
    for (let m = lo; m < hi; ) {
      const nxt = nextMonth(m)
      ms.push({ label: new Date(m).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), start: m, days: (nxt - m) / DAY })
      m = nxt
    }
    return { rangeStart: lo, span: hi - lo, months: ms }
  }, [scheduled, now, viewMonths])

  const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - rangeStart) / span) * 100))
  const todayPct = pct(now)
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

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

  // Drag a FLIGHT bar to move/resize it (snapped to whole weeks) — reschedules that flight's assets.
  const [drag, setDrag] = useState<
    { flightId: string; mode: 'move' | 'resize-l' | 'resize-r'; offsetPx: number; newStart: number; newEnd: number; x: number; y: number } | null
  >(null)
  const dragMovedRef = useRef(false)

  const beginDrag = (e: ReactMouseEvent, bar: { id: string; start: number; end: number }, mode: 'move' | 'resize-l' | 'resize-r') => {
    e.preventDefault()
    e.stopPropagation()
    if (!bar.id) return // synthetic fallback bar — not yet a real flight
    dragMovedRef.current = false
    const startX = e.clientX
    const trackW = bodyRef.current ? bodyRef.current.clientWidth - LABEL_COL : 0
    const totalDays = span / DAY
    const compute = (clientX: number) => {
      const rawDays = trackW > 0 ? ((clientX - startX) / trackW) * totalDays : 0
      const days = Math.round(rawDays / 7) * 7
      const offsetPx = trackW > 0 ? (days / totalDays) * trackW : 0
      let newStart: number, newEnd: number
      if (mode === 'move') {
        newStart = bar.start + days * DAY
        newEnd = bar.end + days * DAY
      } else if (mode === 'resize-r') {
        newStart = bar.start
        newEnd = Math.max(bar.start + WEEK, bar.end + days * DAY)
      } else {
        newStart = Math.min(bar.end - WEEK, bar.start + days * DAY)
        newEnd = bar.end
      }
      return { days, offsetPx, newStart, newEnd }
    }
    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 3) dragMovedRef.current = true
      const r = compute(ev.clientX)
      setDrag({ flightId: bar.id, mode, offsetPx: r.offsetPx, newStart: r.newStart, newEnd: r.newEnd, x: ev.clientX, y: ev.clientY })
    }
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const r = compute(ev.clientX)
      if (r.days !== 0) {
        if (mode === 'move') void moveFlightSchedule(bar.id, r.days)
        else void rescaleFlightSchedule(bar.id, r.newStart, r.newEnd)
      }
      setDrag(null)
      window.setTimeout(() => {
        dragMovedRef.current = false
      }, 0)
    }
    setDrag({ flightId: bar.id, mode, offsetPx: 0, newStart: bar.start, newEnd: bar.end, x: e.clientX, y: e.clientY })
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Drag a single asset's marker to change its launch date (snapped to whole days).
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
          <h1 className="ccal-title">Timeline</h1>
          <p className="ccal-sub">No campaigns yet for {brand || 'this brand'}. Build one and it shows up here on the timeline.</p>
        </header>
      </div>
    )
  }

  return (
    <div className="ccal">
      <header className="ccal-head">
        <div>
          <h1 className="ccal-title">Timeline</h1>
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
          {orderedRows.map((c, idx) => {
            const short = c.name.replace(`${brand} — `, '')
            const display = short.includes(' · ') ? short.split(' · ').slice(1).join(' · ') : short
            const isExp = expanded.has(c.name)
            const multi = c.bars.length > 1
            const openEnded = c.timing === 'always-on'
            // Subheading before the first always-on stream, separating it from the dated campaigns.
            const showAlwaysOnHead = openEnded && (idx === 0 || orderedRows[idx - 1].timing !== 'always-on')
            return (
              <Fragment key={c.name}>
                {showAlwaysOnHead && (
                  <div className="ccal-subhead">
                    <span className="ccal-subhead-ic" aria-hidden="true">∞</span> Always-on
                  </div>
                )}
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
                    {!openEnded && c.bars.some((b) => b.id) && (
                      <button
                        className="ccal-rerun"
                        title="Re-run: add another flight of this campaign (clones its assets into a new window)"
                        aria-label="Add a flight"
                        onClick={(e) => {
                          e.stopPropagation()
                          void addFlightRun(c.name)
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    )}
                    {openEnded && (
                      <button
                        className="ccal-rerun ccal-rotate"
                        title={
                          c.refreshWeeks
                            ? `Rotate creative (every ${c.refreshWeeks} weeks) — pulls this stream's live content back to draft for a refresh`
                            : "Rotate creative — pulls this stream's live content back to draft for a refresh"
                        }
                        aria-label="Rotate creative"
                        onClick={(e) => {
                          e.stopPropagation()
                          showToastAction(`Rotate creative for ${display}? Its live content goes back to draft.`, 'Rotate', () => void rotateAlwaysOn(c.name))
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" />
                        </svg>
                      </button>
                    )}
                    <button
                      className={`ccal-rerun ccal-timing-toggle${openEnded ? ' on' : ''}`}
                      title={openEnded ? 'Always-on stream (evergreen, no end date) — click to make it a dated campaign' : 'Make this an always-on stream (evergreen, no end date)'}
                      aria-label={openEnded ? 'Make dated campaign' : 'Make always-on'}
                      onClick={(e) => {
                        e.stopPropagation()
                        patchCampaign(c.name, openEnded ? { timing: 'one-off', durationWeeks: 4 } : { timing: 'always-on', durationWeeks: 0 })
                        showToast(openEnded ? `${display} is now a dated campaign.` : `${display} is now an always-on stream.`)
                      }}
                    >
                      ∞
                    </button>
                  </div>
                  <div className="ccal-track">
                    {months.map((m) => (
                      <div key={m.start} className="ccal-gridline" style={{ left: `${pct(m.start)}%` }} />
                    ))}
                    {todayPct > 0 && todayPct < 100 && <div className="ccal-today" style={{ left: `${todayPct}%` }} />}
                    {c.bars.map((bar, bi) => {
                      const left = pct(bar.start)
                      // Always-on streams have no end date: run the bar to the right edge instead of
                      // flooring it to a discrete (durationWeeks||4)-week block.
                      const width = openEnded ? Math.max(1.5, 100 - left) : Math.max(1.5, pct(bar.end) - left)
                      const removable = bi > 0 && !!bar.id && !openEnded // re-run flights (not the primary)
                      const d = drag?.flightId === bar.id && bar.id ? drag : null
                      const barStyle: CSSProperties = { background: STATUS_COLOR[c.status] }
                      barStyle.left = d && d.mode !== 'resize-r' ? `calc(${left}% + ${d.offsetPx}px)` : `${left}%`
                      barStyle.width =
                        d && d.mode === 'resize-r'
                          ? `calc(${width}% + ${d.offsetPx}px)`
                          : d && d.mode === 'resize-l'
                            ? `calc(${width}% - ${d.offsetPx}px)`
                            : d && openEnded
                              ? // Open-ended bar: shrink width as the left shifts so the right edge
                                // stays pinned to the timeline edge during a move-drag (no "gains an end" flicker).
                                `calc(${width}% - ${d.offsetPx}px)`
                              : `${width}%`
                      const countShift = d && d.mode !== 'resize-l' ? d.offsetPx : 0
                      const barLabel = multi ? bar.name : display
                      return (
                        <Fragment key={bar.id || 'synthetic'}>
                          <button
                            className={`ccal-bar${openEnded ? ' ccal-bar-alwayson' : ''}${d ? ' dragging' : ''}`}
                            style={barStyle}
                            onMouseDown={(e) => beginDrag(e, bar, 'move')}
                            onClick={() => {
                              if (!dragMovedRef.current) openFlow(c.name)
                            }}
                            title={
                              openEnded
                                ? `${short} · ${bar.name} · always-on · ${bar.assetCount} asset${bar.assetCount === 1 ? '' : 's'} · drag to move`
                                : `${short} · ${bar.name} · ${STATUS_LABEL[c.status]} · ${bar.assetCount} asset${bar.assetCount === 1 ? '' : 's'} · drag to move, edges to resize`
                            }
                          >
                            {!openEnded && <span className="ccal-bar-handle ccal-bar-handle-l" onMouseDown={(e) => beginDrag(e, bar, 'resize-l')} aria-hidden="true" />}
                            <span className="ccal-bar-label">{openEnded ? `∞ ${barLabel}` : barLabel}</span>
                            {!openEnded && <span className="ccal-bar-handle ccal-bar-handle-r" onMouseDown={(e) => beginDrag(e, bar, 'resize-r')} aria-hidden="true" />}
                          </button>
                          {!openEnded && (
                            <span className="ccal-bar-count" style={{ left: `calc(${left + width}% + ${countShift + 6}px)` }} aria-hidden="true">
                              {bar.assetCount} asset{bar.assetCount === 1 ? '' : 's'}
                            </span>
                          )}
                          {removable && (
                            <button
                              className="ccal-bar-remove"
                              style={{ left: `calc(${left + width}% + ${countShift}px - 16px)` }}
                              onClick={(e) => {
                                e.stopPropagation()
                                void removeFlightRun(bar.id)
                              }}
                              title="Remove this flight and its assets"
                              aria-label="Remove flight"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                <path d="M6 6l12 12M18 6L6 18" />
                              </svg>
                            </button>
                          )}
                        </Fragment>
                      )
                    })}
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

      {/* Live tooltip following the cursor while dragging — the flight window or asset launch date. */}
      {(drag || assetDrag) && (
        <div className="ccal-drag-tip" style={{ left: (drag ?? assetDrag)!.x + 14, top: (drag ?? assetDrag)!.y - 34 }}>
          {drag ? `${fmtDate(drag.newStart)} - ${fmtDate(drag.newEnd)}` : fmtDate(assetDrag!.newAt)}
        </div>
      )}
    </div>
  )
}
