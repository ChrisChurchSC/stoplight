import { useEffect, useMemo, useState } from 'react'
import { recordTint } from '../domain/records'
import { CHANNELS } from '../domain/channels'
import type { ChannelId } from '../domain/types'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { AI_MODELS } from '../domain/aiModels'
import { MARKETER_ROLES } from '../domain/userPrefs'
import { inferRole } from '../domain/inferRole'
import { persistState } from '../adapters/state/workspaceState'
import { firstNameOf, getSession, onAuthChange } from '../lib/session'
import { useTrafficStore } from '../store/useTrafficStore'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useAssetTasks } from '../lib/assetTasks'

/**
 * Home — the personalization command center. A greeting and a big Ask box up top (with quick
 * chips), then "Personalization coverage" (audiences × stages covered vs gaps, from buildMatrix),
 * a "Foundation" health strip, and "Tasks" that need you. Scoped to the brand in the rail. This is
 * the "am I covered / what do I do next" home for scaling personalization — no meetings feed.
 */

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
  const openClientWizard = useTrafficStore((s) => s.openClientWizard)
  const userPrefs = useTrafficStore((s) => s.userPrefs)
  const setUserPrefs = useTrafficStore((s) => s.setUserPrefs)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setPage = useTrafficStore((s) => s.setPage)
  const openFlow = useTrafficStore((s) => s.openFlow)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const aiModel = useTrafficStore((s) => s.aiModel)
  const setAiModel = useTrafficStore((s) => s.setAiModel)
  const [q, setQ] = useState('')
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks())
  // The task whose slide-out detail drawer is open (clicking a task opens it here, not the grid).
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  // Greet the signed-in user by name; keep it in sync if they sign in/out.
  const [name, setName] = useState('')
  useEffect(() => {
    let live = true
    void getSession().then((s) => live && setName(firstNameOf(s?.user ?? null)))
    const off = onAuthChange((u) => setName(firstNameOf(u)))
    return () => {
      live = false
      off()
    }
  }, [])

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

  // ── Personalization coverage. Personalization is the combination of the records: producing
  // on-brand content for each audience across each channel it uses. Coverage is how many of those
  // (audience × channel) combinations already have content, out of all that are possible, plus the
  // empty ones to fill next.
  const audiences = useMemo(() => (brand ? clientAudiences[brand] ?? [] : []), [brand, clientAudiences])
  // A brand-new / empty workspace: promote the two setup actions as cards instead of the analytical
  // quick-chips (which have nothing to analyze yet). This reflects the scope you are ACTUALLY
  // looking at. Previously, with no brand selected, `audiences` was always 0 and the canvas filter
  // passed every brand's canvases, so the gate hinged on "does any canvas exist anywhere" — a cold
  // user could be denied the getting-started state by someone else's canvas, and a workspace with
  // audiences but no canvases wrongly read as empty.
  const empty = useMemo(() => {
    // No brands set up yet is a genuinely cold start, even if a stray/imported canvas exists.
    if (Object.keys(clientProfiles).length === 0) return true
    const scopedCanvases = canvases.filter((c) => !brand || c.client === brand)
    const scopedAudiences = brand ? clientAudiences[brand] ?? [] : Object.values(clientAudiences).flat()
    return scopedAudiences.length === 0 && scopedCanvases.length === 0
  }, [clientProfiles, clientAudiences, canvases, brand])
  // Passive role inference: for a workspace with data but no chosen focus, suggest one from its
  // strongest signal (a GTM strategy). Only infer from an UNAMBIGUOUS signal so the nudge never
  // suggests a role from an off-screen brand: the brand in view's own strategy, or — when no single
  // brand is in the rail — the sole strategy if every brand agrees. Silent otherwise; a manual pick wins.
  const roleSuggestion = useMemo(() => {
    const inView = brand ? clientProfiles[brand]?.strategy : null
    if (inView) return inferRole(inView)
    const strategies = [...new Set(Object.values(clientProfiles).map((p) => p.strategy).filter(Boolean))]
    return strategies.length === 1 ? inferRole(strategies[0]) : null
  }, [brand, clientProfiles])
  const brandRows = useMemo(
    () => canvases.filter((c) => !brand || c.client === brand).flatMap((c) => c.rows),
    [canvases, brand],
  )
  // The channels in play for this brand: those its audiences declare + those its content already uses.
  const channels = useMemo(() => {
    const set = new Set<ChannelId>()
    audiences.forEach((a) => a.channels?.forEach((c) => set.add(c)))
    brandRows.forEach((r) => { if (r.channel) set.add(r.channel) })
    return [...set]
  }, [audiences, brandRows])
  // Every audience × channel cell, split into produced (has content) and empty (to fill).
  const coverage = useMemo(() => {
    const made = new Set<string>()
    brandRows.forEach((r) => { if (r.audience && r.channel) made.add(`${r.audience.trim()}|${r.channel}`) })
    const empty: { audience: string; channel: ChannelId }[] = []
    let produced = 0
    audiences.forEach((a) =>
      channels.forEach((c) => {
        if (made.has(`${a.name.trim()}|${c}`)) produced += 1
        else empty.push({ audience: a.name, channel: c })
      }),
    )
    const possible = audiences.length * channels.length
    return { possible, produced, toFill: possible - produced, empty }
  }, [audiences, channels, brandRows])
  const pct = (n: number) => `${(n / Math.max(1, coverage.possible)) * 100}%`

  // Fill an empty combination by drafting content — opens the flow builder, scoped to the brand.
  const draftContent = () => {
    if (brand) setClientFilter(brand)
    openFlow('')
  }

  // ── Campaigns in flight — the brand's campaigns still in motion (not completed), most-active first,
  // each with its scheduling progress (assets scheduled/live of total).
  const flowsInFlight = useMemo(() => {
    const rank: Record<string, number> = { active: 0, 'in-review': 1, planning: 2 }
    return canvases
      .filter((c) => (!brand || c.client === brand) && c.name !== CONTENT_LIBRARY_CAMPAIGN && c.status !== 'completed')
      .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.lastTouched - a.lastTouched)
      .slice(0, 5)
  }, [canvases, brand])

  const toggleTask = (id: string) =>
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
      // persistState mirrors to the workspace when a backend is configured (localStorage otherwise).
      persistState(TASKS_KEY, next)
      window.dispatchEvent(new Event('stoplight:tasks'))
      return next
    })

  // Tasks that are due: manual tasks + derived asset-tasks, ranked by priority — most overdue first,
  // then soonest due, then undated last (overdue dates render in red). Each carries a `derived` flag
  // so the row knows how to check it / where to open. A task's priority is its due time: an earlier
  // due (or further past due) outranks a later one; undated tasks sink to the bottom.
  const openTasks = useMemo(() => {
    const priority = (due: string) => (due ? parseDue(due) : Infinity)
    const manual = tasks
      .filter((t) => !t.done && (!brand || (t.brand ?? '') === brand || !t.brand))
      .map((t) => ({ id: t.id, text: t.text, due: t.due, derived: false, rowId: '', campaign: '' }))
    const assets = assetTasks
      .filter((a) => !a.done)
      .map((a) => ({ id: a.id, text: a.text, due: a.due, derived: true, rowId: a.rowId, campaign: a.campaign }))
    return [...manual, ...assets].sort((a, b) => priority(a.due) - priority(b.due))
  }, [tasks, assetTasks, brand])
  const shownTasks = openTasks.slice(0, 8)
  // The open task's detail (from the full list so it survives even if it falls past the shown 8).
  const openTask = openTasks.find((t) => t.id === openTaskId) ?? null

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
    <>
    <div className="agenda2">
      <div className="agenda2-inner">
        <h1 className="ag2-greet">
          {greeting()}
          {name ? `, ${name}` : ''}.
        </h1>

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
              <select
                className="ag2-ask-model"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                title="Model for the internal AI"
                aria-label="AI model"
              >
                {AI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <button className="ag2-ask-send" onClick={ask} disabled={!q.trim()} aria-label="Ask">↑</button>
            </div>
          </div>
          {!empty && !userPrefs.marketerRole && !userPrefs.focusDismissed && roleSuggestion && (
            <div className="ag2-infer">
              <span className="ag2-infer-txt">
                Looks like you focus on{' '}
                <strong>{MARKETER_ROLES.find((r) => r.value === roleSuggestion.role)?.label ?? roleSuggestion.role}</strong>
                {' '}({roleSuggestion.reason}). Tune Breadcrumbs to it?
              </span>
              <span className="ag2-infer-acts">
                <button
                  className="ag2-infer-yes"
                  onClick={() => setUserPrefs({ marketerRole: roleSuggestion.role, focusDismissed: true })}
                >
                  Yes, focus
                </button>
                <button className="ag2-infer-no" onClick={() => setUserPrefs({ focusDismissed: true })}>
                  No thanks
                </button>
              </span>
            </div>
          )}
          {/* ONE row, whatever the workspace holds. A cold workspace leads with adding a brand by
              hand (the manual wizard); the two data-dependent chips are hidden until there is
              something to personalize or prioritise. Nothing changes shape as data arrives. */}
          <div className="ag2-chips">
            {empty && (
              <button className="ag2-chip ag2-chip-primary" onClick={() => openClientWizard()}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                Add a brand
              </button>
            )}
            <button className="ag2-chip" onClick={() => setPage('flows')}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
              Draft a campaign
            </button>
            {/* Both of these ask about work that has to exist first, so they would send a brand-new
                user to a chat with nothing to answer from. Hidden until there is something to
                personalize or prioritise, without changing what the row looks like. */}
            {!empty && (
              <>
                <button className="ag2-chip" onClick={() => openHomeChat('Help me personalize a campaign for a specific audience')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></svg>
                  Personalize for an audience
                </button>
                <button className="ag2-chip" onClick={() => openHomeChat('What personalization gaps should I prioritize next?')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h10M4 18h7" /></svg>
                  What should I do next?
                </button>
              </>
            )}
          </div>
        </div>

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
              const open = () => setOpenTaskId(t.id)
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

        <section className="ag2-sec">
          <div className="ag2-sec-head">
            <span className="ag2-sec-title">Personalization coverage</span>
          </div>
          {!brand || audiences.length === 0 ? (
            <div className="ag2-empty">
              Add audiences to see what you can personalize.{' '}
              <button className="home-link" onClick={() => setPage('segments')}>Add audiences</button>
            </div>
          ) : channels.length === 0 ? (
            <div className="ag2-empty">
              Add channels to your audiences to see personalization coverage.{' '}
              <button className="home-link" onClick={() => setPage('segments')}>Add channels</button>
            </div>
          ) : (
            <>
              <div className="ag2-cov-summary">
                <span className="ag2-cov-stat"><b>{audiences.length}</b> {audiences.length === 1 ? 'audience' : 'audiences'}</span>
                <span className="ag2-cov-dot">×</span>
                <span className="ag2-cov-stat"><b>{channels.length}</b> {channels.length === 1 ? 'channel' : 'channels'}</span>
                <span className="ag2-cov-dot">·</span>
                <span className="ag2-cov-stat ok"><b>{coverage.produced}</b> produced</span>
                <span className="ag2-cov-dot">·</span>
                <span className="ag2-cov-stat warn"><b>{coverage.toFill}</b> to fill</span>
              </div>
              <div className="ag2-cov-bar" role="img" aria-label={`${coverage.produced} of ${coverage.possible} combinations produced`}>
                {coverage.produced > 0 && <span className="ag2-cov-seg cov" style={{ width: pct(coverage.produced) }} />}
                {coverage.toFill > 0 && <span className="ag2-cov-seg gap" style={{ width: pct(coverage.toFill) }} />}
              </div>
              {coverage.empty.length > 0 && (
                <div className="ag2-cov-gaps">
                  {coverage.empty.slice(0, 5).map((g) => (
                    <button
                      key={`${g.audience}|${g.channel}`}
                      className="ag2-cov-gap"
                      onClick={draftContent}
                      title={`Draft content for ${g.audience} on ${CHANNELS[g.channel]?.label ?? g.channel}`}
                    >
                      <span className="ag2-cov-gap-dot" style={{ background: recordTint(g.audience) }} />
                      <span className="ag2-cov-gap-name">{g.audience}</span>
                      <span className="ag2-cov-gap-sep">·</span>
                      <span className="ag2-cov-gap-chan">{CHANNELS[g.channel]?.label ?? g.channel}</span>
                    </button>
                  ))}
                  {coverage.empty.length > 5 && <span className="ag2-cov-more">+{coverage.empty.length - 5} more</span>}
                </div>
              )}
            </>
          )}
        </section>

        <section className="ag2-sec">
          <div className="ag2-sec-head">
            <span className="ag2-sec-title">Campaigns in flight <span className="ag2-sec-count">{flowsInFlight.length}</span></span>
            <button className="ag2-viewall" onClick={() => setPage('flows')}>View all <span className="ag2-viewall-plus">+</span></button>
          </div>
          {flowsInFlight.length === 0 ? (
            <div className="ag2-empty">
              No flows in flight.{' '}
              <button className="home-link" onClick={() => openHomeChat('Draft a new campaign for this brand')}>Draft a campaign</button>
            </div>
          ) : (
            flowsInFlight.map((c) => {
              const total = c.rows.length
              const live = c.rows.filter((r) => r.status === 'scheduled' || r.status === 'posted').length
              const statusLabel = c.status === 'in-review' ? 'In review' : c.status === 'active' ? 'Active' : 'Planning'
              return (
                <div
                  key={c.name}
                  className="ag2-flow"
                  role="button"
                  tabIndex={0}
                  onClick={() => openFlow(c.name, 'grid')}
                  onKeyDown={(e) => { if (e.key === 'Enter') openFlow(c.name, 'grid') }}
                >
                  <span className={`ag2-flow-dot s-${c.status}`} />
                  <span className="ag2-flow-name">{c.name}</span>
                  {c.flagged && <span className="ag2-flow-flag" title="Needs attention">⚑</span>}
                  <span className="ag2-flow-meta">
                    <span className={`ag2-flow-status s-${c.status}`}>{statusLabel}</span>
                    {total > 0 && <span className="ag2-flow-prog">{live}/{total} scheduled</span>}
                  </span>
                </div>
              )
            })
          )}
        </section>

      </div>
    </div>
    {openTask && (
      <>
        <div onClick={() => setOpenTaskId(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(16,24,40,.28)' }} />
        <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, maxWidth: '92vw', zIndex: 201, background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 30px rgba(16,24,40,.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <button
              className="ag2-check"
              aria-label="Mark done"
              onClick={() => { if (openTask.derived) toggleAssetDone(openTask.rowId); else toggleTask(openTask.id); setOpenTaskId(null) }}
              style={{ flex: '0 0 auto' }}
            />
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{openTask.derived ? 'Asset task' : 'Task'}</span>
            <button onClick={() => setOpenTaskId(null)} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{openTask.text || 'Untitled task'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)' }}>Due</span>
              <span style={{ fontSize: 14, color: openTask.due ? 'var(--text)' : 'var(--text-faint, #8a969b)' }}>{openTask.due ? fmtDate(parseDue(openTask.due)) : 'No date'}</span>
            </div>
            {openTask.derived && openTask.campaign && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)' }}>Campaign</span>
                <button
                  onClick={() => { const c = openTask.campaign; setOpenTaskId(null); openFlow(c, 'flow') }}
                  style={{ alignSelf: 'flex-start', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}
                >
                  {(openTask.campaign ?? '').replace(`${brand} — `, '') || 'Open campaign'} →
                </button>
              </div>
            )}
            {!openTask.derived && (
              <button
                onClick={() => { setOpenTaskId(null); setPage('tasks') }}
                style={{ alignSelf: 'flex-start', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}
              >
                Edit in Tasks →
              </button>
            )}
          </div>
        </aside>
      </>
    )}
    </>
  )
}
