import { useEffect, useMemo, useState } from 'react'
import { recordTint } from '../domain/records'
import { buildMatrix } from '../domain/matrix'
import type { Rtb } from '../domain/rtb'
import { persistState } from '../adapters/state/workspaceState'
import { useTrafficStore } from '../store/useTrafficStore'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useAssetTasks } from '../lib/assetTasks'

/**
 * Home — the personalization command center. A greeting and a big Ask box up top (with quick
 * chips), then "Personalization coverage" (audiences × stages covered vs gaps, from buildMatrix),
 * a "Foundation" health strip, and "Tasks" that need you. Scoped to the brand in the rail. This is
 * the "am I covered / what do I do next" home for scaling personalization — no meetings feed.
 */

const NAME = 'Chris'
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
const fmtDate = (ms: number) => {
  const d = new Date(ms)
  return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function HomeAgenda() {
  const { canvases } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const reports = useTrafficStore((s) => s.reports)
  const openHomeChat = useTrafficStore((s) => s.openHomeChat)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setPage = useTrafficStore((s) => s.setPage)
  const setBrandView = useTrafficStore((s) => s.setBrandView)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)
  const openFlow = useTrafficStore((s) => s.openFlow)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const brandSystems = useTrafficStore((s) => s.brandSystems)
  const voices = useTrafficStore((s) => s.voices)
  const messages = useTrafficStore((s) => s.messages)
  const [q, setQ] = useState('')
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks())

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

  // ── Personalization coverage (audiences × funnel stages), from the same builder the
  // Personalize matrix uses — so the home summary and the matrix always agree.
  const audiences = useMemo(() => (brand ? clientAudiences[brand] ?? [] : []), [brand, clientAudiences])
  const brandRows = useMemo(
    () => canvases.filter((c) => !brand || c.client === brand).flatMap((c) => c.rows),
    [canvases, brand],
  )
  const rtbById = useMemo(() => {
    const m = new Map<string, Rtb>()
    audiences.forEach((a) => a.rtbs?.forEach((r) => m.set(r.id, r)))
    ;(brand ? brandSystems[brand]?.rtbs ?? [] : []).forEach((r) => m.set(r.id, r))
    return m
  }, [audiences, brandSystems, brand])
  const matrix = useMemo(() => buildMatrix(audiences, brandRows, rtbById), [audiences, brandRows, rtbById])
  const { cells, covered, gaps, blocked } = matrix.totals
  const denom = Math.max(1, cells)
  const pct = (n: number) => `${(n / denom) * 100}%`
  // The audiences with the most reachable-but-empty stages — the highest-leverage gaps to fill.
  const topGaps = useMemo(
    () => matrix.rows.filter((r) => r.gaps > 0).sort((a, b) => b.gaps - a.gaps).slice(0, 4),
    [matrix],
  )

  // Open the brand's Personalize matrix (the full audience × stage × channel grid).
  const openMatrix = () => {
    if (!brand) return
    setCampaignFilter('all')
    setBrandView('personalize')
    setPage('clients')
  }

  // ── Foundation health — the strategy the AI writes from, counted for this brand.
  const foundation = useMemo(() => {
    const proofCount = brand ? brandSystems[brand]?.rtbs?.length ?? 0 : 0
    const voiceCount = voices.filter((v) => !v.brand || v.brand === brand).length
    const messageCount = messages.filter((m) => !m.brand || m.brand === brand).length
    return [
      { key: 'audiences', label: 'Audiences', count: audiences.length, go: () => setPage('segments') },
      { key: 'voices', label: 'Voices', count: voiceCount, go: () => setPage('voices') },
      { key: 'messages', label: 'Messages', count: messageCount, go: () => setPage('messages') },
      { key: 'proof', label: 'Proof points', count: proofCount, go: () => setPage('proofpoints') },
    ]
  }, [brand, audiences, brandSystems, voices, messages, setPage])

  const toggleTask = (id: string) =>
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
      // persistState mirrors to the workspace when a backend is configured (localStorage otherwise).
      persistState(TASKS_KEY, next)
      window.dispatchEvent(new Event('stoplight:tasks'))
      return next
    })

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

  const recentReport = useMemo(
    () => [...reports].filter((r) => !brand || r.client === brand).sort((a, b) => b.createdAt - a.createdAt)[0],
    [reports, brand],
  )

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
            <button className="ag2-chip" onClick={() => openHomeChat('Draft a new flow for this brand')}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
              Draft a flow
            </button>
            <button className="ag2-chip" onClick={() => openHomeChat('Help me personalize a campaign for a specific audience')}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></svg>
              Personalize for an audience
            </button>
            <button className="ag2-chip" onClick={() => openHomeChat('What personalization gaps should I prioritize next?')}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h10M4 18h7" /></svg>
              What should I do next?
            </button>
          </div>
        </div>

        <section className="ag2-sec">
          <div className="ag2-sec-head">
            <span className="ag2-sec-title">Personalization coverage</span>
            {brand && audiences.length > 0 && (
              <button className="ag2-viewall" onClick={openMatrix}>Open matrix <span className="ag2-viewall-plus">→</span></button>
            )}
          </div>
          {!brand || audiences.length === 0 ? (
            <div className="ag2-empty">
              Add audiences to see where you&rsquo;re personalized.{' '}
              <button className="home-link" onClick={() => setPage('segments')}>Add audiences</button>
            </div>
          ) : (
            <>
              <div className="ag2-cov-summary">
                <span className="ag2-cov-stat"><b>{audiences.length}</b> {audiences.length === 1 ? 'audience' : 'audiences'}</span>
                <span className="ag2-cov-dot">·</span>
                <span className="ag2-cov-stat"><b>{cells}</b> cells</span>
                <span className="ag2-cov-dot">·</span>
                <span className="ag2-cov-stat ok"><b>{covered}</b> covered</span>
                <span className="ag2-cov-dot">·</span>
                <span className="ag2-cov-stat warn"><b>{gaps}</b> gaps</span>
                {blocked > 0 && (
                  <>
                    <span className="ag2-cov-dot">·</span>
                    <span className="ag2-cov-stat block"><b>{blocked}</b> blocked</span>
                  </>
                )}
              </div>
              <div className="ag2-cov-bar" role="img" aria-label={`${covered} covered, ${gaps} gaps, ${blocked} blocked of ${cells} cells`}>
                {covered > 0 && <span className="ag2-cov-seg cov" style={{ width: pct(covered) }} />}
                {gaps > 0 && <span className="ag2-cov-seg gap" style={{ width: pct(gaps) }} />}
                {blocked > 0 && <span className="ag2-cov-seg block" style={{ width: pct(blocked) }} />}
              </div>
              {topGaps.length > 0 && (
                <div className="ag2-cov-gaps">
                  {topGaps.map((r) => (
                    <button
                      key={r.audience.id}
                      className="ag2-cov-gap"
                      onClick={openMatrix}
                      title={`Open the matrix to fill ${r.audience.name}`}
                    >
                      <span className="ag2-cov-gap-dot" style={{ background: recordTint(r.audience.name) }} />
                      <span className="ag2-cov-gap-name">{r.audience.name}</span>
                      <span className="ag2-cov-gap-count">{r.gaps} {r.gaps === 1 ? 'gap' : 'gaps'}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="ag2-sec">
          <div className="ag2-sec-head">
            <span className="ag2-sec-title">Foundation</span>
          </div>
          <div className="ag2-found">
            {foundation.map((f) => (
              <button key={f.key} className={`ag2-found-item${f.count === 0 ? ' empty' : ''}`} onClick={f.go}>
                <span className="ag2-found-count">{f.count}</span>
                <span className="ag2-found-label">{f.label}</span>
              </button>
            ))}
          </div>
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
