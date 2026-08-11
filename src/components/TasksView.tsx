import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { recordTint } from '../domain/records'
import { clientForCampaign } from '../domain/clients'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { persistState } from '../adapters/state/workspaceState'
import { useTrafficStore } from '../store/useTrafficStore'
import { firstNameOf, getSession, onAuthChange } from '../lib/session'
import { useAssetTasks } from '../lib/assetTasks'
import { useHomeCanvases } from '../lib/useHomeCanvases'

/**
 * Tasks — an Attio-style task list for the workspace: a row per task with its due date, the
 * campaign it belongs to, and who it's assigned to. Grouped either by due date (Overdue / Today /
 * Upcoming / No date) or by campaign.
 *
 * A derived asset-task is assignable like any other. It used to be the read-only kind, which left
 * the whole "Assigned to" column empty on a page where every row was one — a task list where
 * nothing could be owned. Its owner is stored per-asset (see useAssetTasks), the same way done is.
 *
 * The linked COMPANY lives in the detail drawer rather than the table: it was a column reading
 * "Asset" on every derived row and "—" on nearly every other, spending a fifth of the width to say
 * nothing. The campaign is the link that earns a column.
 *
 * The tasks themselves are still self-contained — they live in localStorage, with no store slice
 * or backend of their own. What it does read from the store is the campaigns to link them TO
 * (useHomeCanvases) and the assets that derive into tasks (useAssetTasks).
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

// How the list is grouped. By due date it answers "what is late and what is next"; by campaign,
// "what is still outstanding on this piece of work" — the same tasks, cut the two ways they get
// asked about. The heading a campaign-less task groups under.
type GroupBy = 'due' | 'campaign' | 'assignee'
const NO_CAMPAIGN = 'No campaign'
const NO_ASSIGNEE = 'Unassigned'
/** Filter sentinel for "has nobody on it" — distinct from '' , which is the no-filter state. */
const UNASSIGNED = '\u0000unassigned'

// A small tinted-initial avatar used for both the Record and Assigned-to chips.
function Avatar({ name }: { name: string }) {
  const ch = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <span className="task-avatar" style={{ background: recordTint(name || '?') }}>
      {ch}
    </span>
  )
}

/**
 * The Assigned-to cell: type a name, or pick one the workspace is already using. The suggestions
 * are not a saved list of people — they are the names currently carrying work, so one appears the
 * moment it is first typed and is gone once nothing is assigned to it. Correcting a misspelling is
 * therefore a rename across every task holding it, which the Assignee menu in the toolbar does.
 */
function AssigneeField({ value, names, onCommit }: { value: string; names: string[]; onCommit: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  // Follow the stored value when it changes underneath (a rename from the toolbar, another tab).
  useEffect(() => setDraft(value), [value])
  const q = draft.trim().toLowerCase()
  const matches = names.filter((n) => n !== value && (!q || n.toLowerCase().includes(q)))
  const commit = (name: string) => {
    setDraft(name)
    setOpen(false)
    if (name !== value) onCommit(name)
  }
  return (
    <span className={`task-chip${draft ? '' : ' empty'} task-assignee`}>
      {draft && <Avatar name={draft} />}
      <input
        className="task-input task-chip-input"
        value={draft}
        placeholder="Unassigned"
        onChange={(e) => {
          setDraft(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        // Committing on blur is what makes typing a NEW name work: there is nothing to pick.
        onBlur={() => draft !== value && onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(draft)
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(value)
            setOpen(false)
          }
        }}
      />
      {open && matches.length > 0 && (
        <>
          <div className="task-pick-scrim" onClick={() => setOpen(false)} />
          <div className="task-pick-menu" role="menu">
            <div className="task-pick-head">Already on this workspace</div>
            {matches.map((n) => (
              <button
                key={n}
                className="task-pick-item"
                role="menuitem"
                // mousedown, not click: blur would fire first and commit the half-typed draft.
                onMouseDown={(e) => {
                  e.preventDefault()
                  commit(n)
                }}
              >
                <Avatar name={n} />
                <span className="task-pick-name">{n}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  )
}

export function TasksView() {
  const companies = useTrafficStore((s) => s.companies)
  const jumpToRecord = useTrafficStore((s) => s.jumpToRecord)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const openFlow = useTrafficStore((s) => s.openFlow)
  // '' means unscoped — every brand — and it is a routine state, not a transient one: the rail only
  // auto-picks a brand when Brand records exist, so a workspace of campaigns with no Brand card
  // sits on 'all' indefinitely.
  const brand = clientFilter && clientFilter !== 'all' ? clientFilter : ''
  const { assetTasks, toggleAssetDone, setAssetAssignee, renameAssetAssignee } = useAssetTasks(brand)
  const { canvases } = useHomeCanvases()
  const [tasks, setTasks] = useState<Task[]>(() => load())
  const [editDue, setEditDue] = useState<string | null>(null)
  const [pickCamp, setPickCamp] = useState<string | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>('due')
  const [filterWho, setFilterWho] = useState('')
  const [filterCampaign, setFilterCampaign] = useState('')
  const [openFilter, setOpenFilter] = useState<null | 'who' | 'campaign'>(null)
  // The name currently being corrected in the Assignee menu, and the text being typed for it.
  const [editWho, setEditWho] = useState<string | null>(null)
  const [editWhoDraft, setEditWhoDraft] = useState('')
  // The brand's campaigns, for the Campaign picker. The ingested content-library backfill is not a
  // campaign you'd assign work to, so it stays out of the list.
  const campaigns = useMemo(
    () => canvases.filter((c) => (brand ? c.client === brand : true) && c.name !== CONTENT_LIBRARY_CAMPAIGN).map((c) => c.name),
    [canvases, brand],
  )
  // Campaign names are stored brand-qualified ("Acme — Fall Launch"); show just the campaign part.
  // Keyed off the campaign's OWN brand rather than the selected one, so an unscoped list drops the
  // prefix too — otherwise a brand-qualified name renders as "Arbitrum — Arbitrum Campaign 1" and
  // truncates in the chip, saying the brand twice and the campaign not at all.
  const shortCampaign = (name: string) => {
    const owner = clientForCampaign(name)
    return owner && name.startsWith(`${owner} — `) ? name.slice(owner.length + 3) : name
  }
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
  // before scoping) shows under every brand rather than silently disappearing — and with no brand
  // selected at all the list is unscoped, so a brand-tagged task is shown rather than hidden. See
  // useAssetTasks for why 'no brand' is a routine state and not a transient one.
  const brandTasks = useMemo(() => tasks.filter((t) => !brand || !t.brand || t.brand === brand), [tasks, brand])
  // Derived asset-tasks (shared with Home via useAssetTasks) shaped as full tasks so they merge
  // with manual ones. Read-mostly: the row's check toggles per-asset done and it opens the flow.
  const allTasks = useMemo<Task[]>(
    () => [...brandTasks, ...assetTasks.map((a): Task => ({ ...a, record: null, notes: '' }))],
    [brandTasks, assetTasks],
  )
  const openCount = allTasks.filter((t) => !t.done).length

  // THE NAMES IN USE, with how many tasks each carries. There is no roster to keep: a name exists
  // because something is assigned to it, appears the moment it is first typed, and goes when the
  // last task holding it is reassigned. That is also why a rename has to rewrite every task at once
  // — a misspelling is not an entry to correct, it is a person who currently has work under it.
  const assigneeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of allTasks) if (t.assignee) m.set(t.assignee, (m.get(t.assignee) ?? 0) + 1)
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [allTasks])
  const knownAssignees = useMemo(() => assigneeCounts.map(([n]) => n), [assigneeCounts])

  /** Rename an owner across both kinds of task at once (to '' unassigns them everywhere). */
  const renameAssignee = (from: string, to: string) => {
    setTasks((prev) => prev.map((t) => (t.assignee === from ? { ...t, assignee: to.trim() } : t)))
    renameAssetAssignee(from, to)
    if (filterWho === from) setFilterWho(to.trim())
  }

  // What the filters let through. Applied before grouping so a group's count is what you can see.
  const visible = useMemo(
    () =>
      allTasks.filter(
        (t) =>
          (!filterWho || (filterWho === UNASSIGNED ? !t.assignee : t.assignee === filterWho)) &&
          (!filterCampaign || (t.campaign || '') === filterCampaign),
      ),
    [allTasks, filterWho, filterCampaign],
  )

  // Group the open tasks — into due-date buckets, or by the campaign or the person they belong to
  // (done tasks fall to their own section at the end whichever it is). Soonest-due first within
  // every group, so a group reads as its own running order.
  const groups = useMemo(() => {
    const open = visible.filter((t) => !t.done)
    const byDue = (a: Task, b: Task) => (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt

    // Group on a key, alphabetically, with the "nobody / nothing" bucket last rather than sorted
    // among the names.
    const byKey = (keyOf: (t: Task) => string, last: string) => {
      const map = new Map<string, Task[]>()
      for (const t of open) {
        const key = keyOf(t)
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(t)
      }
      for (const list of map.values()) list.sort(byDue)
      return [...map.entries()].sort(([a], [b]) => (a === last ? 1 : b === last ? -1 : a.localeCompare(b)))
    }

    if (groupBy === 'campaign') return byKey((t) => (t.campaign ? shortCampaign(t.campaign) : NO_CAMPAIGN), NO_CAMPAIGN)
    if (groupBy === 'assignee') return byKey((t) => t.assignee || NO_ASSIGNEE, NO_ASSIGNEE)

    const map = new Map<Bucket, Task[]>()
    for (const b of BUCKETS) map.set(b, [])
    for (const t of open) map.get(bucketOf(t.due, today))!.push(t)
    for (const list of map.values()) list.sort(byDue)
    return BUCKETS.map((b) => [b, map.get(b)!] as const).filter(([, list]) => list.length > 0)
  }, [visible, today, groupBy])
  const doneTasks = useMemo(() => visible.filter((t) => t.done), [visible])
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
        <AssigneeField value={t.assignee} names={knownAssignees} onCommit={(v) => setAssetAssignee(t.rowId!, v)} />
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
      <div className="task-cell">
        <AssigneeField value={t.assignee} names={knownAssignees} onCommit={(v) => patch(t.id, { assignee: v })} />
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

      <div className="tasks-toolbar">
        <span className="tasks-toolbar-label">Group by</span>
        <div className="tasks-groupby" role="group" aria-label="Group tasks by">
          {(['due', 'campaign', 'assignee'] as const).map((g) => (
            <button
              key={g}
              className={`tasks-groupby-btn${groupBy === g ? ' on' : ''}`}
              aria-pressed={groupBy === g}
              onClick={() => setGroupBy(g)}
            >
              {g === 'due' ? 'Due date' : g === 'campaign' ? 'Campaign' : 'Assignee'}
            </button>
          ))}
        </div>

        <span className="tasks-toolbar-gap" />

        {/* Assignee: filters the list, and is also where a name gets corrected or cleared —
            renaming here rewrites every task holding it, manual and derived alike. */}
        <div className="tasks-filter">
          <button
            className={`tasks-filter-btn${filterWho ? ' on' : ''}`}
            onClick={() => setOpenFilter(openFilter === 'who' ? null : 'who')}
          >
            {filterWho === UNASSIGNED ? NO_ASSIGNEE : filterWho || 'Everyone'}
            <span className="tasks-filter-caret">▾</span>
          </button>
          {openFilter === 'who' && (
            <>
              <div className="task-pick-scrim" onClick={() => { setOpenFilter(null); setEditWho(null) }} />
              <div className="task-pick-menu tasks-filter-menu" role="menu">
                <button className={`task-pick-item${filterWho ? '' : ' on'}`} role="menuitem" onClick={() => { setFilterWho(''); setOpenFilter(null) }}>
                  <span className="task-pick-name">Everyone</span>
                </button>
                <button
                  className={`task-pick-item${filterWho === UNASSIGNED ? ' on' : ''}`}
                  role="menuitem"
                  onClick={() => { setFilterWho(UNASSIGNED); setOpenFilter(null) }}
                >
                  <span className="task-pick-name muted">{NO_ASSIGNEE}</span>
                </button>
                {assigneeCounts.length > 0 && <div className="task-pick-head">People</div>}
                {assigneeCounts.map(([name, n]) =>
                  editWho === name ? (
                    <div key={name} className="task-pick-item tasks-filter-edit">
                      <input
                        autoFocus
                        className="task-input"
                        value={editWhoDraft}
                        onChange={(e) => setEditWhoDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { renameAssignee(name, editWhoDraft); setEditWho(null) }
                          if (e.key === 'Escape') setEditWho(null)
                        }}
                      />
                      <button className="tasks-filter-act" title="Save" onClick={() => { renameAssignee(name, editWhoDraft); setEditWho(null) }}>✓</button>
                    </div>
                  ) : (
                    <div key={name} className={`task-pick-item tasks-filter-person${filterWho === name ? ' on' : ''}`}>
                      <button className="tasks-filter-pick" role="menuitem" onClick={() => { setFilterWho(name); setOpenFilter(null) }}>
                        <Avatar name={name} />
                        <span className="task-pick-name">{name}</span>
                        <span className="tasks-filter-count">{n}</span>
                      </button>
                      <button className="tasks-filter-act" title={`Rename ${name} everywhere`} onClick={() => { setEditWho(name); setEditWhoDraft(name) }}>✎</button>
                      <button className="tasks-filter-act" title={`Unassign ${name} from everything`} onClick={() => renameAssignee(name, '')}>✕</button>
                    </div>
                  ),
                )}
              </div>
            </>
          )}
        </div>

        <div className="tasks-filter">
          <button
            className={`tasks-filter-btn${filterCampaign ? ' on' : ''}`}
            onClick={() => setOpenFilter(openFilter === 'campaign' ? null : 'campaign')}
          >
            {filterCampaign ? shortCampaign(filterCampaign) : 'All campaigns'}
            <span className="tasks-filter-caret">▾</span>
          </button>
          {openFilter === 'campaign' && (
            <>
              <div className="task-pick-scrim" onClick={() => setOpenFilter(null)} />
              <div className="task-pick-menu tasks-filter-menu" role="menu">
                <button className={`task-pick-item${filterCampaign ? '' : ' on'}`} role="menuitem" onClick={() => { setFilterCampaign(''); setOpenFilter(null) }}>
                  <span className="task-pick-name">All campaigns</span>
                </button>
                {campaigns.map((name) => (
                  <button
                    key={name}
                    className={`task-pick-item${filterCampaign === name ? ' on' : ''}`}
                    role="menuitem"
                    onClick={() => { setFilterCampaign(name); setOpenFilter(null) }}
                  >
                    <span className="task-pick-name">{shortCampaign(name)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {(filterWho || filterCampaign) && (
          <button className="tasks-filter-clear" onClick={() => { setFilterWho(''); setFilterCampaign('') }}>
            Clear filters
          </button>
        )}
      </div>

      <div className="task-grid task-colhead">
        <div className="task-cell task-cell-name">Task</div>
        <div className="task-cell">Due date</div>
        <div className="task-cell">Campaign</div>
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
