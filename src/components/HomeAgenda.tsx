import { useEffect, useMemo, useState } from 'react'
import { recordTint } from '../domain/records'
import type { TrafficRow } from '../domain/types'
import { persistState } from '../adapters/state/workspaceState'
import { useTrafficStore } from '../store/useTrafficStore'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useAssetTasks } from '../lib/assetTasks'

/**
 * Home — a personal agenda modeled on a calendar/notes home. A greeting and a big Ask box up
 * top (with quick chips), then "Meetings" for the selected day (your Granola notes), then
 * "Tasks" that are due (overdue dates in red). Scoped to the brand in the rail. Tasks live in
 * localStorage (see TasksView); meetings come from ingested Granola notes in the canvases.
 */

const DAY = 86_400_000
const NAME = 'Chris'
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TASKS_KEY = 'stoplight.tasks.v1'

interface Task {
  id: string
  text: string
  due: string
  record: { id: string; name: string } | null
  assignee: string
  done: boolean
  brand?: string
}
const loadTasks = (): Task[] => {
  try {
    const r = JSON.parse(localStorage.getItem(TASKS_KEY) ?? '[]')
    return Array.isArray(r) ? r : []
  } catch {
    return []
  }
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
const parseDue = (iso: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.parse(iso)
}
const startOfDay = (ms: number) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const clock = (ms: number) => {
  const d = new Date(ms)
  let h = d.getHours()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`
}
const fmtDate = (ms: number) => {
  const d = new Date(ms)
  return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}
function dayLabel(ms: number, todayStart: number): string {
  const days = Math.round((startOfDay(ms) - todayStart) / DAY)
  if (days === 0) return `Today, ${MON[new Date(ms).getMonth()]} ${new Date(ms).getDate()}`
  if (days === -1) return 'Yesterday'
  if (days === 1) return 'Tomorrow'
  const d = new Date(ms)
  return `${WD[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`
}
const isMeeting = (r: TrafficRow): boolean => /granola\./i.test(r.sourceUrl ?? '') || r.assetType === 'Meeting note'
const meetingMs = (r: TrafficRow): number =>
  (typeof r.postedAt === 'number' ? r.postedAt : 0) || (r.publishedAt ? parseDue(r.publishedAt) : 0) || r.createdAt || 0

export function HomeAgenda() {
  const { canvases } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const reports = useTrafficStore((s) => s.reports)
  const openHomeChat = useTrafficStore((s) => s.openHomeChat)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setPage = useTrafficStore((s) => s.setPage)
  const openFlow = useTrafficStore((s) => s.openFlow)
  const [q, setQ] = useState('')
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks())
  const [dayOffset, setDayOffset] = useState(0)

  useEffect(() => {
    const update = () => setTasks(loadTasks())
    window.addEventListener('stoplight:tasks', update)
    window.addEventListener('focus', update)
    return () => {
      window.removeEventListener('stoplight:tasks', update)
      window.removeEventListener('focus', update)
    }
  }, [])

  const brand = clientFilter && clientFilter !== 'all' ? clientFilter : null
  const { assetTasks, toggleAssetDone } = useAssetTasks(brand ?? '')
  const now = Date.now()
  const todayStart = startOfDay(now)
  const selDayStart = todayStart + dayOffset * DAY

  const toggleTask = (id: string) =>
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
      // persistState mirrors to the workspace when a backend is configured (localStorage otherwise).
      persistState(TASKS_KEY, next)
      window.dispatchEvent(new Event('stoplight:tasks'))
      return next
    })

  // Meetings for the selected day (Granola notes across the brand's canvases), sorted by time.
  const dayMeetings = useMemo(() => {
    return canvases
      .filter((c) => !brand || c.client === brand)
      .flatMap((c) => c.rows)
      .filter(isMeeting)
      .map((r) => ({ row: r, ms: meetingMs(r) }))
      .filter((x) => startOfDay(x.ms || now) === selDayStart)
      .sort((a, b) => a.ms - b.ms)
  }, [canvases, brand, selDayStart, now])
  const pastCount = dayMeetings.filter((m) => m.ms < now).length

  // Tasks that are due: manual tasks + derived asset-tasks, soonest first (undated last), overdue
  // dates in red. Each carries a `derived` flag so the row knows how to check it / where to open.
  const openTasks = useMemo(() => {
    const manual = tasks
      .filter((t) => !t.done && (!brand || (t.brand ?? '') === brand || !t.brand))
      .map((t) => ({ id: t.id, text: t.text, due: t.due, derived: false, rowId: '', campaign: '' }))
    const assets = assetTasks
      .filter((a) => !a.done)
      .map((a) => ({ id: a.id, text: a.text, due: a.due, derived: true, rowId: a.rowId, campaign: a.campaign }))
    return [...manual, ...assets].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
  }, [tasks, assetTasks, brand])
  const shownTasks = openTasks.slice(0, 8)

  const recentReport = useMemo(() => [...reports].filter((r) => !brand || r.client === brand).sort((a, b) => b.createdAt - a.createdAt)[0], [reports, brand])

  const ask = () => {
    const t = q.trim()
    if (!t) return
    openHomeChat(t)
    setQ('')
  }

  return (
    <div className="agenda2">
      <div className="agenda2-inner">
        <h1 className="ag2-greet">{greeting()}, {NAME}.</h1>

        <div className="ag2-ask">
          {recentReport && (
            <button className="ag2-recent" onClick={() => { setClientFilter(recentReport.client); setPage('reports') }}>
              <span className="ag2-recent-ic">↺</span> Recent chat <span className="ag2-recent-dot">·</span> {recentReport.title}
            </button>
          )}
          <div className="ag2-ask-box">
            <textarea
              className="ag2-ask-input"
              placeholder="Ask anything…"
              rows={3}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
            />
            <div className="ag2-ask-foot">
              <span className="ag2-ask-model">Auto</span>
              <button className="ag2-ask-send" onClick={ask} disabled={!q.trim()} aria-label="Ask">↑</button>
            </div>
          </div>
          <div className="ag2-chips">
            <button className="ag2-chip" onClick={() => openHomeChat('Prep me for my next meeting')}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="3" width="8" height="4" rx="1" /><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 12h6M9 16h4" /></svg>
              Prep for next meeting
            </button>
            <button className="ag2-chip" onClick={() => openHomeChat('Recap my last call')}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></svg>
              Recap last call
            </button>
          </div>
        </div>

        <section className="ag2-sec">
          <div className="ag2-sec-head">
            <span className="ag2-sec-title">Meetings</span>
            <span className="ag2-daynav">
              <span className="ag2-daynav-label">{dayLabel(selDayStart, todayStart)}</span>
              <button className="ag2-daynav-btn" aria-label="Previous day" onClick={() => setDayOffset((o) => o - 1)}>‹</button>
              <button className="ag2-daynav-btn" aria-label="Next day" onClick={() => setDayOffset((o) => o + 1)}>›</button>
            </span>
          </div>
          {dayMeetings.length === 0 ? (
            <div className="ag2-empty">No meetings this day. Connect Granola to see your calls here.</div>
          ) : (
            <>
              <div className="ag2-mtg-sub">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
                {pastCount > 0 ? `${pastCount} past ${pastCount === 1 ? 'event' : 'events'}` : `${dayMeetings.length} ${dayMeetings.length === 1 ? 'event' : 'events'}`}
              </div>
              {dayMeetings.map(({ row, ms }) => {
                const past = ms < now
                return (
                  <div key={row.id} className="ag2-mtg-row" role="button" tabIndex={0} onClick={() => setPage('library')} onKeyDown={(e) => { if (e.key === 'Enter') setPage('library') }}>
                    <span className="ag2-mtg-dot" style={{ background: past ? 'var(--text-faint)' : recordTint(row.assetName) }} />
                    <span className={`ag2-mtg-t${past ? ' past' : ''}`}>{row.assetName}</span>
                    <span className="ag2-mtg-time">{clock(ms)}</span>
                  </div>
                )
              })}
            </>
          )}
        </section>

        <section className="ag2-sec">
          <div className="ag2-sec-head">
            <span className="ag2-sec-title">Tasks <span className="ag2-sec-count">{openTasks.length}</span></span>
            <button className="ag2-viewall" onClick={() => setPage('tasks')}>View all <span className="ag2-viewall-plus">+</span></button>
          </div>
          {shownTasks.length === 0 ? (
            <div className="ag2-empty">No tasks due. Add tasks and they&rsquo;ll show up here.</div>
          ) : (
            shownTasks.map((t) => {
              const due = t.due ? parseDue(t.due) : null
              const overdue = due != null && startOfDay(due) <= todayStart
              const open = () => (t.derived ? openFlow(t.campaign, 'grid') : setPage('tasks'))
              const check = () => (t.derived ? toggleAssetDone(t.rowId) : toggleTask(t.id))
              return (
                <div key={t.id} className="ag2-task">
                  <button className="ag2-check" aria-label="Mark done" onClick={check} />
                  <span className="ag2-task-t" onClick={open} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') open() }}>{t.text || 'Untitled task'}</span>
                  {due != null && <span className={`ag2-task-due${overdue ? ' over' : ''}`}>{fmtDate(due)}</span>}
                </div>
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}
