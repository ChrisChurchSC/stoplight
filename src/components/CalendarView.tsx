import { useState } from 'react'
import { CHANNELS } from '../domain/channels'
import type { RowStatus, TrafficRow } from '../domain/types'
import { rowInScope } from '../lib/scope'
import { journeyPerformance, formatReach } from '../domain/journeyPerf'
import { PlanPerfStrip } from './PlanPerfStrip'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WD1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const STATUS_COLOR: Record<RowStatus, string> = {
  draft: '#9aa0aa',
  in_review: '#c8881f',
  scheduled: 'var(--blue)',
  approved: 'var(--blue)',
  rejected: '#b42318',
  posted: 'var(--green)',
  failed: '#b42318',
}

const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(d.getDate() + n)
  return x
}
const startOfWeek = (d: Date) => addDays(d, -d.getDay())

type Mode = 'month' | 'week' | '3day' | 'quarter'
const MODES: { key: Mode; label: string }[] = [
  { key: '3day', label: '3 days' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
]

export function CalendarView({ allClients = false, liveScope = false, scopeClient }: { allClients?: boolean; liveScope?: boolean; scopeClient?: string }) {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const proofFilter = useTrafficStore((s) => s.proofFilter)
  const ctaFilter = useTrafficStore((s) => s.ctaFilter)
  const audienceFilter = useTrafficStore((s) => s.audienceFilter)
  const cardFilter = useTrafficStore((s) => s.cardFilter)
  const query = useTrafficStore((s) => s.query)
  const clientFilterStore = useTrafficStore((s) => s.clientFilter)
  const campaignFilterStore = useTrafficStore((s) => s.campaignFilter)
  // `scopeClient` (from the brand folder's combined Calendar) pins the view to one
  // brand across ALL its campaigns, overriding the global client/campaign filters.
  const clientFilter = scopeClient ?? clientFilterStore
  const campaignFilter = scopeClient ? 'all' : campaignFilterStore
  const openReview = useTrafficStore((s) => s.openReview)

  const now = new Date()
  const [mode, setMode] = useState<Mode>('month')
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  const [dayKey, setDayKey] = useState<string | null>(null)

  // The brand-folder combined calendar shows the whole brand — it must not inherit
  // the per-canvas sidebar filters, which would otherwise hide assets outside a
  // stale filter from a previous canvas session.
  const scoped = !!scopeClient
  const view = allClients
    ? rows
    : rows.filter((r) =>
        rowInScope(r, {
          filter: scoped ? 'all' : filter,
          proofFilter: scoped ? 'all' : proofFilter,
          ctaFilter: scoped ? 'all' : ctaFilter,
          audienceFilter: scoped ? 'all' : audienceFilter,
          cardFilter: scoped ? 'all' : cardFilter,
          query: scoped ? '' : query,
          clientFilter,
          campaignFilter,
          liveOnly: liveScope,
        }),
      )

  // Journey performance (reach) on the campaign — the same numbers as the canvas +
  // grid, so an asset's reach reads the same wherever you look at it.
  const journeyPerf = journeyPerformance(
    allClients ? rows : rows.filter((r) => rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter })),
  )
  const reachOf = (r: TrafficRow) => journeyPerf.perAsset.get(r.id)?.reach ?? 0

  // Point-in-time content (a post, a send) vs. assets that run over a period
  // (always-on ads, landing pages, nurture flows) — the latter render as spans.
  const startOfDay = (s: string) => {
    const d = new Date(s)
    d.setHours(0, 0, 0, 0)
    return d
  }
  const dayDiff = (a: Date, b: Date) => Math.round((+b - +a) / 86_400_000)
  const spanRows = view.filter((r) => r.endsAt)
  const pointRows = view.filter((r) => !r.endsAt)

  const byDay = new Map<string, TrafficRow[]>()
  for (const r of pointRows) {
    const key = ymd(new Date(r.scheduledAt))
    const list = byDay.get(key)
    if (list) list.push(r)
    else byDay.set(key, [r])
  }
  const pointsOn = (d: Date) =>
    (byDay.get(ymd(d)) ?? []).slice().sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
  const spansOn = (d: Date) =>
    spanRows.filter((r) => d >= startOfDay(r.scheduledAt) && d <= startOfDay(r.endsAt!))
  const eventsOn = (d: Date) => [...pointsOn(d), ...spansOn(d)]

  const todayKey = ymd(now)

  const step = (dir: number) => {
    if (mode === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1))
    else if (mode === 'quarter') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir * 3, 1))
    else setCursor(addDays(cursor, dir * (mode === 'week' ? 7 : 3)))
  }

  let title = ''
  if (mode === 'month') title = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
  else if (mode === 'quarter') title = `Q${Math.floor(cursor.getMonth() / 3) + 1} ${cursor.getFullYear()}`
  else {
    const start = mode === 'week' ? startOfWeek(cursor) : cursor
    const end = addDays(start, mode === 'week' ? 6 : 2)
    const f = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    title = `${f(start)} – ${f(end)}, ${end.getFullYear()}`
  }

  const Event = ({ r }: { r: TrafficRow }) => {
    const reach = reachOf(r)
    return (
      <button
        className="cal-event"
        onClick={() => openReview(r.id)}
        title={`${CHANNELS[r.channel].label} · ${r.assetName} · ${new Date(r.scheduledAt).toLocaleString(
          undefined,
          { hour: 'numeric', minute: '2-digit' },
        )} · ${r.status}${reach ? ` · reach ${reach.toLocaleString()}` : ''}`}
      >
        <span className="cal-event-dot" style={{ background: STATUS_COLOR[r.status] }} />
        <ChannelIcon channel={r.channel} size={12} />
        <span className="cal-event-name">{r.assetName}</span>
        {reach > 0 && <span className="cal-event-reach">{formatReach(reach)}</span>}
      </button>
    )
  }

  // ---- Month grid: weeks of day cells + multi-day span bars overlaid ----
  function MonthBody({ anchor }: { anchor: Date }) {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const gridStart = startOfWeek(first)
    const weeks = Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i)),
    )
    return (
      <>
        <div className="cal-weekdays">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-weekday">{w}</div>
          ))}
        </div>
        <div className="cal-month">
          {weeks.map((days, wi) => {
            const ws = days[0]
            const we = days[6]
            // Spans intersecting this week, clamped to it, packed into lanes.
            const hits = spanRows
              .map((r) => {
                const s = startOfDay(r.scheduledAt)
                const e = startOfDay(r.endsAt!)
                if (e < ws || s > we) return null
                return {
                  r,
                  startCol: Math.max(0, dayDiff(ws, s)),
                  endCol: Math.min(6, dayDiff(ws, e)),
                  contL: s < ws,
                  contR: e > we,
                }
              })
              .filter((x): x is NonNullable<typeof x> => x !== null)
              .sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol)
            const laneEnd: number[] = []
            const placed = hits.map((h) => {
              let lane = 0
              while (lane < laneEnd.length && laneEnd[lane] >= h.startCol) lane++
              laneEnd[lane] = h.endCol
              return { ...h, lane }
            })
            const bands = laneEnd.length
            return (
              <div className="cal-week" key={wi} style={{ ['--bands' as string]: bands }}>
                {days.map((d) => {
                  const key = ymd(d)
                  const inMonth = d.getMonth() === anchor.getMonth()
                  const evs = pointsOn(d)
                  const channels = [...new Set(evs.map((r) => r.channel))]
                  return (
                    <div
                      key={key}
                      className={`cal-day cal-day--wk${inMonth ? '' : ' out'}${key === todayKey ? ' today' : ''}`}
                    >
                      <div className="cal-daynum">{d.getDate()}</div>
                      {evs.length > 0 && (
                        <button
                          className="cal-day-summary"
                          onClick={() => setDayKey(key)}
                          title={`${evs.length} scheduled`}
                        >
                          <span className="cal-day-logos">
                            {channels.slice(0, 5).map((c) => (
                              <span key={c} className="cal-logo" title={CHANNELS[c].label}>
                                <ChannelIcon channel={c} size={13} />
                              </span>
                            ))}
                            {channels.length > 5 && (
                              <span className="cal-logo cal-logo-more">+{channels.length - 5}</span>
                            )}
                          </span>
                          <span className="cal-day-count">
                            {evs.length} asset{evs.length === 1 ? '' : 's'}
                          </span>
                        </button>
                      )}
                    </div>
                  )
                })}
                {placed.length > 0 && (
                  <div className="cal-week-spans">
                    {placed.map((h) => (
                      <button
                        key={h.r.id}
                        className={`cal-span${h.contL ? ' cont-l' : ''}${h.contR ? ' cont-r' : ''}`}
                        style={{ gridColumn: `${h.startCol + 1} / ${h.endCol + 2}`, gridRow: h.lane + 1 }}
                        onClick={() => openReview(h.r.id)}
                        title={`${CHANNELS[h.r.channel].label} · ${h.r.assetName} · runs to ${new Date(
                          h.r.endsAt!,
                        ).toLocaleDateString()}`}
                      >
                        <ChannelIcon channel={h.r.channel} size={11} color="#fff" />
                        {!h.contL && <span className="cal-span-name">{h.r.assetName}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </>
    )
  }

  // ---- Week / 3-day columns (full event lists) ----
  function ColumnsBody() {
    const start = mode === 'week' ? startOfWeek(cursor) : cursor
    const count = mode === 'week' ? 7 : 3
    const days = Array.from({ length: count }, (_, i) => addDays(start, i))
    return (
      <div className="cal-cols" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
        {days.map((d) => {
          const evs = eventsOn(d)
          return (
            <div key={ymd(d)} className="cal-col">
              <div className={`cal-col-head${ymd(d) === todayKey ? ' today' : ''}`}>
                <span className="cal-col-wd">{WEEKDAYS[d.getDay()]}</span>
                <span className="cal-col-num">{d.getDate()}</span>
              </div>
              <div className="cal-col-events">
                {evs.length === 0 ? (
                  <div className="cal-col-empty">No posts</div>
                ) : (
                  evs.map((r) => <Event key={r.id} r={r} />)
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ---- Quarter (3 mini months) ----
  function QuarterBody() {
    const qStart = Math.floor(cursor.getMonth() / 3) * 3
    const months = [0, 1, 2].map((i) => new Date(cursor.getFullYear(), qStart + i, 1))
    return (
      <div className="cal-quarter">
        {months.map((m) => {
          const gridStart = startOfWeek(new Date(m.getFullYear(), m.getMonth(), 1))
          const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
          return (
            <div key={m.getMonth()} className="cal-mini">
              <div className="cal-mini-title">{MONTHS[m.getMonth()]}</div>
              <div className="cal-mini-wd">
                {WD1.map((w, i) => (
                  <span key={i}>{w}</span>
                ))}
              </div>
              <div className="cal-mini-grid">
                {days.map((d) => {
                  const key = ymd(d)
                  const inMonth = d.getMonth() === m.getMonth()
                  const n = eventsOn(d).length
                  return (
                    <button
                      key={key}
                      className={`cal-mini-day${inMonth ? '' : ' out'}${key === todayKey ? ' today' : ''}${n ? ' has' : ''}`}
                      onClick={() => n && setDayKey(key)}
                      title={n ? `${n} scheduled` : undefined}
                    >
                      {d.getDate()}
                      {n > 0 && <span className="cal-mini-dot" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ---- Day detail popover (so busy days fit everything) ----
  let popover = null
  if (dayKey) {
    const [yy, mm, dd] = dayKey.split('-').map(Number)
    const date = new Date(yy, mm, dd)
    const evs = eventsOn(date)
    popover = (
      <>
        <div className="drawer-scrim" onClick={() => setDayKey(null)} />
        <div className="cal-pop">
          <div className="cal-pop-head">
            <strong>{date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</strong>
            <span className="cal-pop-count">{evs.length} scheduled</span>
            <span className="spacer" />
            <button className="btn ghost sm" onClick={() => setDayKey(null)}>✕</button>
          </div>
          <div className="cal-pop-list">
            {evs.map((r) => (
              <button
                key={r.id}
                className="cal-event"
                onClick={() => {
                  openReview(r.id)
                  setDayKey(null)
                }}
              >
                <span className="cal-event-dot" style={{ background: STATUS_COLOR[r.status] }} />
                <ChannelIcon channel={r.channel} size={12} />
                <span className="cal-event-name">{r.assetName}</span>
                <span className="cal-pop-time">
                  {new Date(r.scheduledAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </span>
              </button>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="sheet-grid">
      <div className="cal">
        <div className="cal-head">
          <div className="cal-nav">
            <button className="btn ghost sm" onClick={() => step(-1)} title="Previous">‹</button>
            <button
              className="btn ghost sm"
              onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), now.getDate()))}
              title="Jump to today"
            >
              Today
            </button>
            <button className="btn ghost sm" onClick={() => step(1)} title="Next">›</button>
          </div>
          <h2 className="cal-title">{title}</h2>
          <span className="cal-meta">{view.length} scheduled</span>
          <div className="cal-modes" role="group" aria-label="Range">
            {MODES.map((m) => (
              <button
                key={m.key}
                className={`view-btn${mode === m.key ? ' active' : ''}`}
                onClick={() => setMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <PlanPerfStrip plan={journeyPerf.plan} />

        {mode === 'month' && <MonthBody anchor={cursor} />}
        {(mode === 'week' || mode === '3day') && <ColumnsBody />}
        {mode === 'quarter' && <QuarterBody />}
      </div>
      {popover}
    </div>
  )
}
