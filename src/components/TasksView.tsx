import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { recordTint } from '../domain/records'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { persistState } from '../adapters/state/workspaceState'
import { useTrafficStore } from '../store/useTrafficStore'
import { firstNameOf, getSession, onAuthChange } from '../lib/session'
import { useAssetTasks } from '../lib/assetTasks'
import { useHomeCanvases } from '../lib/useHomeCanvases'

/**
 * Tasks — a standalone, Attio-style task list for the workspace: a row per task with its due date,
 * the record it relates to, and who it's assigned to, grouped by due date (Overdue / Today /
 * Upcoming / No date). Deliberately self-contained — tasks live in localStorage, so this page owns
 * its own data with no store slice or backend.
 */
// A task's linked record — a Companies row, by id + name (name cached so the chip renders even if
// the company is later renamed/removed). Null when the task isn't tied to a company.
interface TaskRecord {
  id: string
  name: string
}
interface Task {
  id: string
  text: string
  due: string // 'YYYY-MM-DD' or ''
  record: TaskRecord | null
  assignee: string
  done: boolean
  createdAt: number
  brand: string // which brand this task belongs to (scoped by the rail)
  notes: string // free-form details, shown in the task detail drawer
  /** The campaign this task belongs to (campaign name), or '' when it hangs off no campaign.
   *  First-class on every task: a derived task inherits its asset's campaign, and a manual one
   *  picks from the brand's campaigns — so both row types populate the same column. */
  campaign?: string
  // ---- Derived asset-tasks (a flow's built asset, surfaced here as a to-do) ----
  /** True when this task is derived from an asset rather than hand-created. Read-mostly:
   *  its name/date come from the asset, it opens the flow, and "done" is tracked per-asset. */
  derived?: boolean
  /** For a derived task: the asset's row id (tracks done). */
  rowId?: string
}

const KEY = 'stoplight.tasks.v1'

// Normalize a persisted task: `record` used to be a free-text string, so migrate any old value.
const normRecord = (r: unknown): TaskRecord | null =>
  r && typeof r === 'object' && 'name' in r ? (r as TaskRecord) : typeof r === 'string' && r ? { id: '', name: r } : null

const load = (): Task[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return (raw as Task[]).map((t) => ({ ...t, record: normRecord(t.record), brand: t.brand ?? '', notes: t.notes ?? '', campaign: t.campaign ?? '' }))
  } catch {
    return []
  }
}
const freshId = () => `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtDue = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return ''
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Which bucket a task falls in, and the order buckets render in.
const BUCKETS = ['Overdue', 'Today', 'Upcoming', 'No date'] as const
type Bucket = (typeof BUCKETS)[number]
const bucketOf = (due: string, today: string): Bucket => {
  if (!due) return 'No date'
  if (due < today) return 'Overdue'
  if (due === today) return 'Today'
  return 'Upcoming'
}

// A small tinted-initial avatar used for both the Record and Assigned-to chips.
function Avatar({ name }: { name: string }) {
  const ch = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <span className="task-avatar" style={{ background: recordTint(name || '?') }}>
      {ch}
    </span>
  )
}

export function TasksView() {
  const companies = useTrafficStore((s) => s.companies)
  const jumpToRecord = useTrafficStore((s) => s.jumpToRecord)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const openFlow = useTrafficStore((s) => s.openFlow)
  // The rail always lands on a real brand now, but guard against a transient 'all'.
  const brand = clientFilter && clientFilter !== 'all' ? clientFilter : ''
  const { assetTasks, toggleAssetDone } = useAssetTasks(brand)
  const { canvases } = useHomeCanvases()
  const [tasks, setTasks] = useState<Task[]>(() => load())
  const [editDue, setEditDue] = useState<string | null>(null)
  const [pickRec, setPickRec] = useState<string | null>(null)
  const [pickCamp, setPickCamp] = useState<string | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  // The brand's campaigns, for the Campaign picker. The ingested content-library backfill is not a
  // campaign you'd assign work to, so it stays out of the list.
  const campaigns = useMemo(
    () => canvases.filter((c) => (brand ? c.client === brand : true) && c.name !== CONTENT_LIBRARY_CAMPAIGN).map((c) => c.name),
    [canvases, brand],
  )
  // Campaign names are stored brand-qualified ("Acme — Fall Launch"); show just the campaign part.
  const shortCampaign = (name: string) => (brand ? name.replace(`${brand} — `, '') : name)
  const today = localDate()
  // The signed-in user's name, used as the default assignee for a new task. It has to come from
  // the session: a name written into this file would be that one person assigned to every task in
  // every deployment. Empty when signed out or with no backend, which the assignee field already
  // renders as "Unassigned".
  const [me, setMe] = useState('')
  useEffect(() => {
    let live = true
    void getSession().then((s) => live && setMe(firstNameOf(s?.user ?? null)))
    const off = onAuthChange((u) => setMe(firstNameOf(u)))
    return () => {
      live = false
      off()
    }
  }, [])

  useEffect(() => {
    // persistState writes localStorage AND mirrors to the workspace when a backend is configured,
    // so tasks sync per workspace (falls back to a plain localStorage write otherwise).
    persistState(KEY, tasks)
    // Same-tab localStorage writes don't fire a 'storage' event, so tell listeners (the sidebar
    // count) directly.
    window.dispatchEvent(new Event('stoplight:tasks'))
  }, [tasks])
  // Everything below is scoped to the brand selected in the rail. Any untagged task (e.g. created
  // before scoping) shows under every brand rather than silently disappearing.
  const brandTasks = useMemo(() => tasks.filter((t) => !t.brand || t.brand === brand), [tasks, brand])
  // Derived asset-tasks (shared with Home via useAssetTasks) shaped as full tasks so they merge
  // with manual ones. Read-mostly: the row's check toggles per-asset done and it opens the flow.
  const allTasks = useMemo<Task[]>(
    () => [...brandTasks, ...assetTasks.map((a): Task => ({ ...a, record: null, assignee: '', notes: '' }))],
    [brandTasks, assetTasks],
  )
  const openCount = allTasks.filter((t) => !t.done).length

  // Group the open tasks into due-date buckets (done tasks fall to their own section at the end).
  const groups = useMemo(() => {
    const open = allTasks.filter((t) => !t.done)
    const map = new Map<Bucket, Task[]>()
    for (const b of BUCKETS) map.set(b, [])
    for (const t of open) map.get(bucketOf(t.due, today))!.push(t)
    for (const list of map.values())
      list.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt)
    return BUCKETS.map((b) => [b, map.get(b)!] as const).filter(([, list]) => list.length > 0)
  }, [allTasks, today])
  const doneTasks = useMemo(() => allTasks.filter((t) => t.done), [allTasks])
  // The task whose detail drawer is open — from allTasks so derived asset-tasks open their own detail
  // too (read live so edits to a manual task reflect immediately).
  const openTask = allTasks.find((t) => t.id === openTaskId) ?? null

  // Jump to Companies and pop the linked company's record drawer.
  const openCompany = (id: string) => {
    jumpToRecord(id, 'records')
  }
  const patch = (id: string, p: Partial<Task>) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t)))
  const remove = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id))
  const addTask = () => {
    const id = freshId()
    setTasks((prev) => [...prev, { id, text: '', due: today, record: null, assignee: me, done: false, createdAt: Date.now(), brand, notes: '', campaign: '' }])
    // Open the detail drawer for the fresh task so it can be named and filled in.
    setOpenTaskId(id)
  }

  // A derived asset-task: read-mostly. Check toggles per-asset done; the name and the flow chip
  // both open the asset's flow. No company / assignee / delete (those belong to manual tasks).
  const assetRow = (t: Task) => (
    <div key={t.id} className={`task-grid task-row${t.done ? ' done' : ''}`}>
      <div className="task-cell task-cell-name">
        <button
          className={`task-check${t.done ? ' on' : ''}`}
          onClick={() => toggleAssetDone(t.rowId!)}
          aria-label={t.done ? 'Mark not done' : 'Mark done'}
        >
          {t.done && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 6" />
            </svg>
          )}
        </button>
        <button
          className="task-input task-name-input task-name-open"
          onClick={() => setOpenTaskId(t.id)}
          title="Open task details"
          style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', color: 'var(--text)', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {t.text}
        </button>
      </div>
      <div className="task-cell">
        <span className={`task-due-text${!t.done && t.due && t.due <= today ? ' soon' : ''}${t.due ? '' : ' empty'}`}>
          {t.due ? `Due ${fmtDue(t.due)}` : 'No date'}
        </span>
      </div>
      <div className="task-cell task-rec-cell">
        {t.campaign ? (
          <button className="task-chip task-chip-set" onClick={() => openFlow(t.campaign!, 'flow')} title={`Open ${shortCampaign(t.campaign)}`}>
            <span className="task-chip-name">{shortCampaign(t.campaign)}</span>
          </button>
        ) : (
          <span className="task-chip empty"><span className="task-chip-name muted">—</span></span>
        )}
      </div>
      <div className="task-cell">
        <span className="task-chip empty"><span className="task-chip-name muted">Asset</span></span>
      </div>
      <div className="task-cell">
        <span className="task-chip empty"><span className="task-chip-name muted">—</span></span>
      </div>
    </div>
  )

  const row = (t: Task) => (
    <div key={t.id} className={`task-grid task-row${t.done ? ' done' : ''}`}>
      <div className="task-cell task-cell-name">
        <button
          className={`task-check${t.done ? ' on' : ''}`}
          onClick={() => patch(t.id, { done: !t.done })}
          aria-label={t.done ? 'Mark not done' : 'Mark done'}
        >
          {t.done && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 6" />
            </svg>
          )}
        </button>
        <button
          className="task-input task-name-input task-name-open"
          onClick={() => setOpenTaskId(t.id)}
          title="Open task details"
          style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', color: t.text ? 'var(--text)' : 'var(--text-faint, #8a969b)', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {t.text || 'Untitled task'}
        </button>
        <button className="task-del" onClick={() => remove(t.id)} aria-label="Delete task" title="Delete">
          ✕
        </button>
      </div>
      <div className="task-cell">
        {editDue === t.id ? (
          <input
            type="date"
            autoFocus
            className="task-due-input"
            value={t.due}
            onChange={(e) => patch(t.id, { due: e.target.value })}
            onBlur={() => setEditDue(null)}
          />
        ) : (
          <button
            className={`task-due-text${!t.done && t.due && t.due <= today ? ' soon' : ''}${t.due ? '' : ' empty'}`}
            onClick={() => setEditDue(t.id)}
          >
            {t.due ? `Due ${fmtDue(t.due)}` : 'Set date'}
          </button>
        )}
      </div>
      <div className="task-cell task-rec-cell">
        {t.campaign ? (
          <span className="task-chip task-chip-set">
            <button className="task-chip-open" onClick={() => openFlow(t.campaign!, 'flow')} title={`Open ${shortCampaign(t.campaign)}`}>
              <span className="task-chip-name">{shortCampaign(t.campaign)}</span>
            </button>
            <button className="task-chip-edit" onClick={() => setPickCamp(t.id)} title="Change campaign" aria-label="Change campaign">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </span>
        ) : (
          <button className="task-chip task-chip-btn empty" onClick={() => setPickCamp(t.id)} title="Link a campaign">
            <span className="task-chip-name muted">—</span>
          </button>
        )}
        {pickCamp === t.id && (
          <>
            <div className="task-pick-scrim" onClick={() => setPickCamp(null)} />
            <div className="task-pick-menu" role="menu">
              <div className="task-pick-head">Campaigns</div>
              {campaigns.length === 0 && <div className="task-pick-empty">No campaigns yet</div>}
              {campaigns.map((name) => (
                <button
                  key={name}
                  className={`task-pick-item${t.campaign === name ? ' on' : ''}`}
                  role="menuitem"
                  onClick={() => {
                    patch(t.id, { campaign: name })
                    setPickCamp(null)
                  }}
                >
                  <span className="task-pick-name">{shortCampaign(name)}</span>
                </button>
              ))}
              {t.campaign && (
                <button
                  className="task-pick-item task-pick-clear"
                  role="menuitem"
                  onClick={() => {
                    patch(t.id, { campaign: '' })
                    setPickCamp(null)
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <div className="task-cell task-rec-cell">
        {t.record ? (
          <span className="task-chip task-chip-set">
            <button className="task-chip-open" onClick={() => openCompany(t.record!.id)} title={`Open ${t.record.name}`}>
              <Avatar name={t.record.name} />
              <span className="task-chip-name">{t.record.name}</span>
            </button>
            <button className="task-chip-edit" onClick={() => setPickRec(t.id)} title="Change company" aria-label="Change company">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </span>
        ) : (
          <button className="task-chip task-chip-btn empty" onClick={() => setPickRec(t.id)} title="Link a company">
            <span className="task-chip-name muted">—</span>
          </button>
        )}
        {pickRec === t.id && (
          <>
            <div className="task-pick-scrim" onClick={() => setPickRec(null)} />
            <div className="task-pick-menu" role="menu">
              <div className="task-pick-head">Companies</div>
              {companies.length === 0 && <div className="task-pick-empty">No companies yet</div>}
              {companies.map((c) => (
                <button
                  key={c.id}
                  className={`task-pick-item${t.record?.id === c.id ? ' on' : ''}`}
                  role="menuitem"
                  onClick={() => {
                    patch(t.id, { record: { id: c.id, name: c.name } })
                    setPickRec(null)
                  }}
                >
                  <Avatar name={c.name} />
                  <span className="task-pick-name">{c.name}</span>
                </button>
              ))}
              {t.record && (
                <button
                  className="task-pick-item task-pick-clear"
                  role="menuitem"
                  onClick={() => {
                    patch(t.id, { record: null })
                    setPickRec(null)
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <div className="task-cell">
        <span className={`task-chip${t.assignee ? '' : ' empty'}`}>
          {t.assignee && <Avatar name={t.assignee} />}
          <input
            className="task-input task-chip-input"
            value={t.assignee}
            placeholder="Unassigned"
            onChange={(e) => patch(t.id, { assignee: e.target.value })}
          />
        </span>
      </div>
    </div>
  )

  const fieldRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 }
  const fieldLabel: CSSProperties = { width: 92, flex: '0 0 auto', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }
  const fieldControl: CSSProperties = { flex: 1, minWidth: 0, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13 }

  return (
    <>
    <div className="mtx tasks-view">
      <header className="mtx-head tasks-head">
        <h2>Tasks</h2>
        <span className="mtx-sub">{openCount > 0 ? `${openCount} open${brand ? ` · ${brand}` : ''}` : `A running to-do list for ${brand || 'this workspace'}`}</span>
        <button className="tasks-new" onClick={addTask}>
          ＋ New task
        </button>
      </header>

      <div className="tasks-toolbar">Sorted by Due date</div>

      <div className="task-grid task-colhead">
        <div className="task-cell task-cell-name">Task</div>
        <div className="task-cell">Due date</div>
        <div className="task-cell">Campaign</div>
        <div className="task-cell">Record</div>
        <div className="task-cell">Assigned to</div>
      </div>

      {allTasks.length === 0 ? (
        <div className="mtx-empty">No tasks for {brand || 'this workspace'} yet. Build a campaign, or add one with “＋ New task”.</div>
      ) : (
        <>
          {groups.map(([bucket, list]) => (
            <div key={bucket} className="task-group">
              <div className={`task-group-head${bucket === 'Overdue' ? ' overdue' : ''}`}>
                {bucket} <span className="task-group-count">{list.length}</span>
              </div>
              {list.map((t) => (t.derived ? assetRow(t) : row(t)))}
            </div>
          ))}
          {doneTasks.length > 0 && (
            <div className="task-group">
              <div className="task-group-head">
                Done <span className="task-group-count">{doneTasks.length}</span>
              </div>
              {doneTasks.map((t) => (t.derived ? assetRow(t) : row(t)))}
            </div>
          )}
        </>
      )}
    </div>

    {openTask && (
      <>
        <div onClick={() => setOpenTaskId(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(16,24,40,.28)' }} />
        {openTask.derived ? (
          <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, maxWidth: '92vw', zIndex: 201, background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 30px rgba(16,24,40,.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <button className={`task-check${openTask.done ? ' on' : ''}`} onClick={() => toggleAssetDone(openTask.rowId!)} aria-label={openTask.done ? 'Mark not done' : 'Mark done'} style={{ flex: '0 0 auto' }}>
                {openTask.done && (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 6" /></svg>)}
              </button>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{openTask.done ? 'Completed asset' : 'Asset task'}</span>
              <button onClick={() => setOpenTaskId(null)} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1 }}>×</button>
            </header>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{openTask.text || 'Untitled asset'}</div>
              <div style={fieldRow}>
                <span style={fieldLabel}>Status</span>
                <button onClick={() => toggleAssetDone(openTask.rowId!)} style={{ ...fieldControl, cursor: 'pointer', textAlign: 'left', color: openTask.done ? 'var(--accent-2, #0e6d84)' : 'var(--text)' }}>{openTask.done ? '✓ Done' : 'Open'}</button>
              </div>
              <div style={fieldRow}>
                <span style={fieldLabel}>Due date</span>
                <span style={{ ...fieldControl, color: openTask.due ? 'var(--text)' : 'var(--text-faint, #8a969b)' }}>{openTask.due ? fmtDue(openTask.due) : 'No date'}</span>
              </div>
              <div style={fieldRow}>
                <span style={fieldLabel}>Campaign</span>
                <span style={fieldControl}>{openTask.campaign ? shortCampaign(openTask.campaign) : '—'}</span>
              </div>
              <div style={fieldRow}>
                <span style={fieldLabel} />
                <button onClick={() => { openFlow(openTask.campaign ?? '', 'grid'); setOpenTaskId(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-2, #0e6d84)', fontFamily: 'inherit', fontSize: 12, padding: 0, textAlign: 'left' }}>Open in flow ↗</button>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>This task is a built asset from a flow. Edit its content in the flow.</div>
            </div>
          </aside>
        ) : (
        <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, maxWidth: '92vw', zIndex: 201, background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 30px rgba(16,24,40,.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <button className={`task-check${openTask.done ? ' on' : ''}`} onClick={() => patch(openTask.id, { done: !openTask.done })} aria-label={openTask.done ? 'Mark not done' : 'Mark done'} style={{ flex: '0 0 auto' }}>
              {openTask.done && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 6" /></svg>
              )}
            </button>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{openTask.done ? 'Completed task' : 'Task'}</span>
            <button onClick={() => { remove(openTask.id); setOpenTaskId(null) }} title="Delete task" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: 13 }}>Delete</button>
            <button onClick={() => setOpenTaskId(null)} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1 }}>×</button>
          </header>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input autoFocus value={openTask.text} placeholder="Task name" onFocus={(e) => { e.currentTarget.setSelectionRange(0, 0); e.currentTarget.scrollLeft = 0 }} onChange={(e) => patch(openTask.id, { text: e.target.value })} style={{ fontSize: 18, fontWeight: 700, border: 'none', outline: 'none', background: 'none', color: 'var(--text)', fontFamily: 'inherit', padding: 0 }} />

            <div style={fieldRow}>
              <span style={fieldLabel}>Status</span>
              <button onClick={() => patch(openTask.id, { done: !openTask.done })} style={{ ...fieldControl, cursor: 'pointer', textAlign: 'left', color: openTask.done ? 'var(--accent-2, #0e6d84)' : 'var(--text)' }}>{openTask.done ? '✓ Done' : 'Open'}</button>
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Due date</span>
              <input type="date" value={openTask.due} onChange={(e) => patch(openTask.id, { due: e.target.value })} style={fieldControl} />
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Campaign</span>
              <select value={openTask.campaign ?? ''} onChange={(e) => patch(openTask.id, { campaign: e.target.value })} style={fieldControl}>
                <option value="">—</option>
                {/* A campaign the task already points at but that is no longer in the list (renamed
                    or removed) still shows, so the link is never silently dropped. */}
                {openTask.campaign && !campaigns.includes(openTask.campaign) && (
                  <option value={openTask.campaign}>{shortCampaign(openTask.campaign)}</option>
                )}
                {campaigns.map((name) => (<option key={name} value={name}>{shortCampaign(name)}</option>))}
              </select>
            </div>
            {openTask.campaign && (
              <div style={fieldRow}>
                <span style={fieldLabel} />
                <button onClick={() => { openFlow(openTask.campaign!, 'flow'); setOpenTaskId(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-2, #0e6d84)', fontFamily: 'inherit', fontSize: 12, padding: 0, textAlign: 'left' }}>Open {shortCampaign(openTask.campaign)} ↗</button>
              </div>
            )}

            <div style={fieldRow}>
              <span style={fieldLabel}>Company</span>
              <select value={openTask.record?.id ?? ''} onChange={(e) => { const c = companies.find((c) => c.id === e.target.value); patch(openTask.id, { record: c ? { id: c.id, name: c.name } : null }) }} style={fieldControl}>
                <option value="">—</option>
                {openTask.record && openTask.record.id === '' && <option value="">{openTask.record.name}</option>}
                {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            {openTask.record?.id && (
              <div style={fieldRow}>
                <span style={fieldLabel} />
                <button onClick={() => { openCompany(openTask.record!.id); setOpenTaskId(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-2, #0e6d84)', fontFamily: 'inherit', fontSize: 12, padding: 0, textAlign: 'left' }}>Open {openTask.record.name} ↗</button>
              </div>
            )}

            <div style={fieldRow}>
              <span style={fieldLabel}>Assignee</span>
              <input value={openTask.assignee} placeholder="Unassigned" onChange={(e) => patch(openTask.id, { assignee: e.target.value })} style={fieldControl} />
            </div>

            <div>
              <span style={{ ...fieldLabel, display: 'block', width: 'auto', marginBottom: 6 }}>Notes</span>
              <textarea value={openTask.notes} placeholder="Add details, links, context…" onChange={(e) => patch(openTask.id, { notes: e.target.value })} rows={6} style={{ ...fieldControl, width: '100%', resize: 'vertical', lineHeight: 1.5 }} />
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              <div>Brand · {openTask.brand || '—'}</div>
              <div>Created · {new Date(openTask.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
          </div>
        </aside>
        )}
      </>
    )}
    </>
  )
}
