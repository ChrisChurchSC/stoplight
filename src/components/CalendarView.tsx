import { useState } from 'react'
import { CHANNELS } from '../domain/channels'
import type { RowStatus, TrafficRow } from '../domain/types'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const STATUS_COLOR: Record<RowStatus, string> = {
  draft: '#9aa0aa',
  scheduled: 'var(--blue)',
  approved: 'var(--blue)',
  posted: 'var(--green)',
  failed: '#b42318',
}

const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export function CalendarView({ allClients = false }: { allClients?: boolean }) {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const query = useTrafficStore((s) => s.query)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const openReview = useTrafficStore((s) => s.openReview)

  const now = new Date()
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))

  const view = allClients
    ? rows
    : rows.filter((r) => rowInScope(r, { filter, query, clientFilter, campaignFilter }))

  // Bucket rows by their scheduled calendar day.
  const byDay = new Map<string, TrafficRow[]>()
  for (const r of view) {
    const key = ymd(new Date(r.scheduledAt))
    const list = byDay.get(key)
    if (list) list.push(r)
    else byDay.set(key, [r])
  }

  // Build the 6-week grid starting on the Sunday on/before the 1st.
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - first.getDay())
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    days.push(d)
  }

  const todayKey = ymd(now)
  const scheduled = view.length

  return (
    <div className="sheet-grid">
      <div className="cal">
        <div className="cal-head">
        <div className="cal-nav">
          <button
            className="btn ghost sm"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            title="Previous month"
          >
            ‹
          </button>
          <button
            className="btn ghost sm"
            onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), 1))}
            title="Jump to this month"
          >
            Today
          </button>
          <button
            className="btn ghost sm"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            title="Next month"
          >
            ›
          </button>
        </div>
        <h2 className="cal-title">
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
        </h2>
        <div className="cal-meta">{scheduled} scheduled</div>
      </div>

      <div className="cal-weekdays">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">{w}</div>
        ))}
      </div>

      <div className="cal-grid">
        {days.map((d) => {
          const key = ymd(d)
          const inMonth = d.getMonth() === cursor.getMonth()
          const events = (byDay.get(key) ?? []).sort(
            (a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt),
          )
          return (
            <div
              key={key}
              className={`cal-day${inMonth ? '' : ' out'}${key === todayKey ? ' today' : ''}`}
            >
              <div className="cal-daynum">{d.getDate()}</div>
              <div className="cal-events">
                {events.map((r) => (
                  <button
                    key={r.id}
                    className="cal-event"
                    style={{ borderLeftColor: STATUS_COLOR[r.status] }}
                    onClick={() => openReview(r.id)}
                    title={`${CHANNELS[r.channel].label} · ${r.assetName} · ${new Date(
                      r.scheduledAt,
                    ).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })} · ${r.status}`}
                  >
                    <ChannelIcon channel={r.channel} size={12} />
                    <span className="cal-event-name">{r.assetName}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
