import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { recordTint } from '../domain/records'
import { clientForCampaign } from '../domain/clients'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { DRAFTS, folderSegments } from '../domain/campaignFolders'
import { persistState } from '../adapters/state/workspaceState'
import { useTrafficStore } from '../store/useTrafficStore'
import { firstNameOf, getSession, onAuthChange } from '../lib/session'
import { useAssetTasks } from '../lib/assetTasks'
import { assignTints, loadTintStore, renameTint, ASSIGNEE_TINT_KEY } from '../lib/assigneeTint'
import { CHANNELS } from '../domain/channels'
import { ChannelIcon } from './ChannelIcon'
import { InfoTip } from './InfoTip'
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
  /** For a derived task: the asset's row id (tracks done) and the channel it goes out on. A
   *  hand-made task has no channel — it is not a post, so the channel filter leaves it out. */
  rowId?: string
  channel?: string
  /** A derived task's asset name without the channel in front — paired with the channel icon. */
  assetName?: string
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

/** What a due date says. "Due today" rather than the date it happens to be: the row is telling you
 *  when to act, and today is the answer, not August 11th. Late keeps its date — how late matters. */
const dueText = (due: string, today: string, blank: string): string => {
  if (!due) return blank
  return due === today ? 'Due today' : `Due ${fmtDue(due)}`
}

/** How a due date reads on the row. Late and due-today used to share one class, so both came out
 *  the same red — readable under a "Overdue" heading, and not readable at all once grouping by
 *  campaign or assignee took those headings away and left the colour to say it alone. */
const dueTone = (t: { done: boolean; due: string }, today: string): string => {
  if (t.done || !t.due) return ''
  if (t.due < today) return ' late'
  return t.due === today ? ' soon' : ''
}

// How the list is grouped. By due date it answers "what is late and what is next"; by campaign,
// "what is still outstanding on this piece of work" — the same tasks, cut the two ways they get
// asked about. The heading a campaign-less task groups under.
type GroupBy = 'due' | 'campaign' | 'assignee' | 'folder'
const NO_CAMPAIGN = 'No campaign'
const NO_ASSIGNEE = 'Unassigned'
/** Filter sentinel for "has nobody on it" — distinct from '' , which is the no-filter state. */
const UNASSIGNED = '\u0000unassigned'
/** The channel filter's entry for work that is not a post at all. A hand-made task has no channel,
 *  and used to just fall out of a channel filter — findable by no filter, which on a board of
 *  thirty posts means not findable. It is its own kind of work, so it gets its own answer. */
const CUSTOM_TASKS = '\u0000custom'
/** A campaign-filter value that means "everything filed here", not one campaign. Prefixed because a
 *  folder path and a campaign name are different namespaces that would otherwise be indistinguishable. */
const FOLDER_PREFIX = '\u0000folder:'
const CUSTOM_TASKS_LABEL = 'Custom tasks'

/** The one mark on the row, and only on an overdue date. Colour alone cannot carry "late" — it
 *  says nothing to a colourblind reader and nothing in a greyscale print — so the state that
 *  matters most gets a shape as well. It hangs in the margin rather than sitting in the text, so
 *  every due date in the column still starts on the same left edge and the dot is what breaks it.
 *  Everything else stays unmarked, because a mark on every row is a mark you stop seeing. */
function LateMark() {
  return <span className="task-due-mark" aria-hidden="true" />
}

// A small tinted-initial avatar used for both the Record and Assigned-to chips.
function Avatar({ name, tint }: { name: string; tint?: string }) {
  const ch = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <span className="task-avatar" style={{ background: tint ?? recordTint(name || '?') }}>
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
function AssigneeField({ value, names, tints, onCommit }: { value: string; names: string[]; tints: Map<string, string>; onCommit: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
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
      {draft && <Avatar name={draft} tint={tints.get(draft)} />}
      <input
        ref={inputRef}
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
      {/* The same two actions as the Assignee menu, and deliberately NOT the same reach: there they
          act on the person across every task, here on this one row. An ✕ beside a name in a cell
          reads as "take them off this", and quietly unassigning them from eleven other tasks is not
          something a row should be able to do by accident. */}
      {draft && (
        <span className="task-assignee-acts">
          <button
            className="tasks-filter-act"
            title="Change who this is assigned to"
            onMouseDown={(e) => {
              e.preventDefault()
              inputRef.current?.focus()
              inputRef.current?.select()
            }}
          >
            ✎
          </button>
          <button className="tasks-filter-act" title="Unassign this task" onMouseDown={(e) => { e.preventDefault(); commit('') }}>
            ✕
          </button>
        </span>
      )}
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
                <Avatar name={n} tint={tints.get(n)} />
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
  const [filterChannel, setFilterChannel] = useState('')
  const [openFilter, setOpenFilter] = useState<null | 'who' | 'campaign' | 'channel'>(null)
  // The name currently being corrected in the Assignee menu, and the text being typed for it.
  const [editWho, setEditWho] = useState<string | null>(null)
  const [editWhoDraft, setEditWhoDraft] = useState('')
  // The person whose ✕ has been pressed but not yet confirmed. This one reaches every task they
  // hold, which is not something to do on a single click of a small glyph.
  const [confirmWho, setConfirmWho] = useState<string | null>(null)
  // The brand's campaigns, for the Campaign picker. The ingested content-library backfill is not a
  // campaign you'd assign work to, so it stays out of the list.
  const campaigns = useMemo(
    () => canvases.filter((c) => (brand ? c.client === brand : true) && c.name !== CONTENT_LIBRARY_CAMPAIGN).map((c) => c.name),
    [canvases, brand],
  )
  /**
   * A campaign's FOLDER, which on the Campaigns page is the heading it sits under. It is resolved
   * from the campaign rather than stored on the task, so refiling a campaign moves its tasks with
   * it and there is one answer rather than a copy per row.
   *
   * This is the column that stops the table going ambiguous. A campaign made without a brand keeps
   * the name it was typed — campaignStoredName only prefixes when there IS a brand — so "Rebrand
   * Launch" filed under Arbitrum carries nothing at all saying Arbitrum, and the row reads the same
   * as one belonging to anybody. The folder is what the person filing it actually chose.
   */
  const folderOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of canvases) if (c.folder) m.set(c.name, c.folder)
    return m
  }, [canvases])
  // Nested folders are a path ("Arbitrum/Q3"); show it whole, because the top segment is usually
  // the brand and dropping it would lose exactly what this column is for.
  const folderLabel = (campaign: string) => {
    const path = folderOf.get(campaign)
    return path ? folderSegments(path).join(' / ') : DRAFTS
  }
  /**
   * The campaign filter's contents, grouped by folder. A flat list of campaigns stops being
   * scannable at five or six per client, and "all the Oxyle work" is the cut most days want — but
   * folders ALONE would drop single-campaign filtering, which gets more useful as the count grows,
   * not less. So: both, at the level you point at.
   */
  const campaignsByFolder = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const name of campaigns) {
      const key = folderOf.get(name) ? folderSegments(folderOf.get(name)!).join(' / ') : DRAFTS
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(name)
    }
    // Folders alphabetically, unfiled last — the same order the rest of the page uses.
    return [...groups.entries()].sort(([a], [b]) => (a === DRAFTS ? 1 : b === DRAFTS ? -1 : a.localeCompare(b)))
  }, [campaigns, folderOf])
  /** What the campaign pill reads. The filter value is a folder OR a campaign, and the folder form
   *  carries a sentinel prefix — passing that to shortCampaign left the prefix on screen, with only
   *  the leading NUL invisible, so the pill read "folder:Oxyle". */
  const campaignFilterLabel = () => {
    if (!filterCampaign) return 'All campaigns'
    if (filterCampaign.startsWith(FOLDER_PREFIX)) return filterCampaign.slice(FOLDER_PREFIX.length)
    return shortCampaign(filterCampaign)
  }
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

  // The channels actually on the board, so the filter only ever offers work that exists. Hand-made
  // tasks have no channel and are not counted here.
  const channels = useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of assetTasks) if (t.channel && !seen.has(t.channel)) seen.set(t.channel, CHANNELS[t.channel as keyof typeof CHANNELS]?.label ?? t.channel)
    const list = [...seen.entries()].sort(([, a], [, b]) => a.localeCompare(b))
    // Hand-made tasks last, and only when there are some — the same shape as "No campaign" and
    // "Unassigned": the named things in order, then the ones that are none of them.
    if (brandTasks.length) list.push([CUSTOM_TASKS, CUSTOM_TASKS_LABEL])
    return list
  }, [assetTasks, brandTasks])


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
  // One colour each, decided on first sight of a name and then kept — see assigneeTint for why it
  // is remembered rather than derived. Resolving is pure; the write happens in the effect below.
  const [tintStore, setTintStore] = useState(loadTintStore)
  const { tints, store: nextTintStore, changed: tintsChanged } = useMemo(
    () => assignTints(knownAssignees, tintStore),
    [knownAssignees, tintStore],
  )
  useEffect(() => {
    if (!tintsChanged) return
    persistState(ASSIGNEE_TINT_KEY, nextTintStore)
    setTintStore(nextTintStore)
  }, [tintsChanged, nextTintStore])

  /** Rename an owner across both kinds of task at once (to '' unassigns them everywhere). */
  const renameAssignee = (from: string, to: string) => {
    setTasks((prev) => prev.map((t) => (t.assignee === from ? { ...t, assignee: to.trim() } : t)))
    renameAssetAssignee(from, to)
    // Correcting a spelling should not recolour the person.
    const moved = renameTint(tintStore, from, to.trim())
    if (moved !== tintStore) {
      persistState(ASSIGNEE_TINT_KEY, moved)
      setTintStore(moved)
    }
    if (filterWho === from) setFilterWho(to.trim())
  }

  // What the filters let through. Applied before grouping so a group's count is what you can see.
  const visible = useMemo(
    () =>
      allTasks.filter(
        (t) =>
          (!filterWho || (filterWho === UNASSIGNED ? !t.assignee : t.assignee === filterWho)) &&
          (!filterCampaign ||
            (filterCampaign.startsWith(FOLDER_PREFIX)
              ? folderLabel(t.campaign ?? '') === filterCampaign.slice(FOLDER_PREFIX.length)
              : (t.campaign || '') === filterCampaign)) &&
          (!filterChannel || (filterChannel === CUSTOM_TASKS ? !t.derived : t.channel === filterChannel)),
      ),
    [allTasks, filterWho, filterCampaign, filterChannel],
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

    if (groupBy === 'folder') return byKey((t) => folderLabel(t.campaign ?? ''), DRAFTS)
    if (groupBy === 'campaign') return byKey((t) => (t.campaign ? shortCampaign(t.campaign) : NO_CAMPAIGN), NO_CAMPAIGN)
    if (groupBy === 'assignee') return byKey((t) => t.assignee || NO_ASSIGNEE, NO_ASSIGNEE)

    const map = new Map<Bucket, Task[]>()
    for (const b of BUCKETS) map.set(b, [])
    for (const t of open) map.get(bucketOf(t.due, today))!.push(t)
    for (const list of map.values()) list.sort(byDue)
    return BUCKETS.map((b) => [b, map.get(b)!] as const).filter(([, list]) => list.length > 0)
  }, [visible, today, groupBy, folderOf])
  const doneTasks = useMemo(() => visible.filter((t) => t.done), [visible])
  const visibleOpen = visible.filter((t) => !t.done).length
  const filtered = Boolean(filterWho || filterCampaign || filterChannel)
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
        {/* The channel as a mark, not a word. Spelled out it half-repeated the asset's own name —
            "LinkedIn post · LinkedIn image post #1" — and the rows whose names carried no channel
            were left looking like a different column. */}
        {t.channel && (
          <span className="task-channel" title={CHANNELS[t.channel as keyof typeof CHANNELS]?.label ?? t.channel}>
            <ChannelIcon channel={t.channel as Parameters<typeof ChannelIcon>[0]['channel']} size={13} />
          </span>
        )}
        <button
          className="task-input task-name-input task-name-open"
          onClick={() => setOpenTaskId(t.id)}
          title="Open task details"
          style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', color: 'var(--text)', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {t.assetName ?? t.text}
        </button>
      </div>
      <div className="task-cell">
        <span className={`task-due-text${dueTone(t, today)}${t.due ? '' : ' empty'}`}>
          {dueTone(t, today) === ' late' && <LateMark />}
          {dueText(t.due, today, 'No date')}
        </span>
      </div>
      <div className="task-cell task-cell-folder">
        <span className={`task-folder${folderOf.get(t.campaign ?? '') ? '' : ' task-folder-none'}`}>{folderLabel(t.campaign ?? '')}</span>
      </div>
      <div className="task-cell task-rec-cell task-cell-campaign">
        {t.campaign ? (
          <button className="task-chip task-chip-set" onClick={() => openFlow(t.campaign!, 'flow')} title={`Open ${shortCampaign(t.campaign)}`}>
            <span className="task-chip-name">{shortCampaign(t.campaign)}</span>
          </button>
        ) : (
          <span className="task-chip empty"><span className="task-chip-name muted">—</span></span>
        )}
      </div>
      <div className="task-cell">
        <AssigneeField value={t.assignee} names={knownAssignees} tints={tints} onCommit={(v) => setAssetAssignee(t.rowId!, v)} />
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
            className={`task-due-text${dueTone(t, today)}${t.due ? '' : ' empty'}`}
            onClick={() => setEditDue(t.id)}
          >
            {dueTone(t, today) === ' late' && <LateMark />}
            {dueText(t.due, today, 'Set date')}
          </button>
        )}
      </div>
      <div className="task-cell task-cell-folder">
        <span className={`task-folder${folderOf.get(t.campaign ?? '') ? '' : ' task-folder-none'}`}>{folderLabel(t.campaign ?? '')}</span>
      </div>
      <div className="task-cell task-rec-cell task-cell-campaign">
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
        <AssigneeField value={t.assignee} names={knownAssignees} tints={tints} onCommit={(v) => patch(t.id, { assignee: v })} />
      </div>
    </div>
  )

  /**
   * A column header, and the control for grouping by it: click to group, click again to stop. The
   * header fills in while it is the grouping, which is the whole indicator — no glyph, because the
   * fill already says it and a mark beside it would say it twice.
   *
   * Clicking groups outright rather than opening a menu. That does spend the gesture a sort would
   * want later; if sorting arrives, it needs its own affordance rather than taking this one back.
   * The Task column is not a header of this kind — there is nothing sensible to group a name by.
   *
   * Every header behaves the same way and the table keeps its shape whichever one is pressed. The
   * campaign column used to hide itself while it was the grouping, on the grounds that its chips
   * repeated the heading above them; but once the header is the control, a column that changes
   * when you click it reads as breakage, and hiding it took away the only thing that would undo
   * it. The repetition is the cheaper price.
   */
  const ColHead = ({ label, col, className = '' }: { label: string; col: GroupBy; className?: string }) => {
    const on = groupBy === col
    return (
      <div className={`task-cell task-colhead-cell${on ? ' grouped' : ''} ${className}`}>
        <button
          className="task-colhead-btn"
          aria-pressed={on}
          onClick={() => setGroupBy(on ? 'due' : col)}
          title={on ? `Stop grouping by ${label}` : `Group by ${label}`}
        >
          <span className="task-colhead-label">{label}</span>
        </button>
      </div>
    )
  }

  const fieldRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 }
  const fieldLabel: CSSProperties = { width: 92, flex: '0 0 auto', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }
  const fieldControl: CSSProperties = { flex: 1, minWidth: 0, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13 }

  return (
    <>
    <div className="mtx tasks-view">
      {/* Built to the Campaigns page's header, because they are the same kind of page and were
          wearing different clothes: title at 24/800 with its glossary tip inline, the count on its
          own line beneath at 13px, actions across the row. */}
      {/* Everything down to the rule under the column heads holds still while the rows scroll: on a
          board of thirty-odd tasks the column names and the filters that produced them were the
          first things to leave the screen, which is exactly when you need to know what you are
          reading and what is being hidden. */}
      <div className="tasks-sticky">
      <header className="tasks-head">
        <div>
          <h1 className="tasks-title">
            Tasks
            <InfoTip term="task" />
          </h1>
          <p className="tasks-sub">
            {/* When a filter is on, the count has to be the count of what is ON SCREEN — it read
                "31 open" over a single row, and over no rows at all, which makes it a number about
                nothing you can see. The whole is still worth saying, as the thing being sliced. */}
            {filtered
              ? `${visibleOpen} of ${openCount} open${brand ? ` · ${brand}` : ''}`
              : openCount > 0
                ? `${openCount} open${brand ? ` · ${brand}` : ''}`
                : `A running to-do list for ${brand || 'this workspace'}`}
          </p>
        </div>
        <button className="tasks-new" onClick={addTask}>
          ＋ New task
        </button>
      </header>

      <div className="tasks-toolbar">
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
              <div className="task-pick-scrim" onClick={() => { setOpenFilter(null); setEditWho(null); setConfirmWho(null) }} />
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
                    confirmWho === name ? (
                      <div key={name} className="task-pick-item tasks-filter-confirm">
                        <span className="tasks-filter-confirm-text">
                          Take {name} off {n} {n === 1 ? 'task' : 'tasks'}?
                        </span>
                        <button className="tasks-filter-confirm-no" onClick={() => setConfirmWho(null)}>Cancel</button>
                        <button
                          className="tasks-filter-confirm-yes"
                          onClick={() => {
                            renameAssignee(name, '')
                            setConfirmWho(null)
                          }}
                        >
                          Unassign
                        </button>
                      </div>
                    ) : (
                    <div key={name} className={`task-pick-item tasks-filter-person${filterWho === name ? ' on' : ''}`}>
                      <button className="tasks-filter-pick" role="menuitem" onClick={() => { setFilterWho(name); setOpenFilter(null) }}>
                        <Avatar name={name} tint={tints.get(name)} />
                        <span className="task-pick-name">{name}</span>
                        <span className="tasks-filter-count">{n}</span>
                      </button>
                      <button className="tasks-filter-act" title={`Rename ${name} everywhere`} onClick={() => { setEditWho(name); setEditWhoDraft(name) }}>✎</button>
                      {/* Asks first. The row's ✕ takes one task; this one takes every task they
                          hold, and the two are a glyph apart in a menu. */}
                      <button className="tasks-filter-act" title={`Unassign ${name} from every task`} onClick={() => setConfirmWho(name)}>✕</button>
                    </div>
                    )
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
            {campaignFilterLabel()}
            <span className="tasks-filter-caret">▾</span>
          </button>
          {openFilter === 'campaign' && (
            <>
              <div className="task-pick-scrim" onClick={() => setOpenFilter(null)} />
              <div className="task-pick-menu tasks-filter-menu" role="menu">
                <button className={`task-pick-item${filterCampaign ? '' : ' on'}`} role="menuitem" onClick={() => { setFilterCampaign(''); setOpenFilter(null) }}>
                  <span className="task-pick-name">All campaigns</span>
                </button>
                {campaignsByFolder.map(([folder, names]) => (
                  <Fragment key={folder}>
                    {/* The folder itself is selectable — one click for everything filed under it,
                        which is the coarse cut most days want. */}
                    <button
                      className={`task-pick-item tasks-filter-folder${filterCampaign === FOLDER_PREFIX + folder ? ' on' : ''}`}
                      role="menuitem"
                      onClick={() => { setFilterCampaign(FOLDER_PREFIX + folder); setOpenFilter(null) }}
                    >
                      <span className="task-pick-name">{folder}</span>
                      <span className="tasks-filter-count">{names.length}</span>
                    </button>
                    {names.map((name) => (
                      <button
                        key={name}
                        className={`task-pick-item tasks-filter-sub${filterCampaign === name ? ' on' : ''}`}
                        role="menuitem"
                        onClick={() => { setFilterCampaign(name); setOpenFilter(null) }}
                      >
                        <span className="task-pick-name">{shortCampaign(name)}</span>
                      </button>
                    ))}
                  </Fragment>
                ))}
              </div>
            </>
          )}
        </div>

        {/* What KIND of work: "just the Instagram posts", which is how someone doing one kind of
            thing reads the board. Named "All work" rather than "All channels" because the last
            entry is Custom tasks, which is not a channel — the list is kinds of work, and channel
            is what nearly all of them happen to be. */}
        {channels.length > 0 && (
          <div className="tasks-filter">
            <button
              className={`tasks-filter-btn${filterChannel ? ' on' : ''}`}
              onClick={() => setOpenFilter(openFilter === 'channel' ? null : 'channel')}
            >
              {filterChannel === CUSTOM_TASKS ? CUSTOM_TASKS_LABEL : filterChannel ? (CHANNELS[filterChannel as keyof typeof CHANNELS]?.label ?? filterChannel) : 'All work'}
              <span className="tasks-filter-caret">▾</span>
            </button>
            {openFilter === 'channel' && (
              <>
                <div className="task-pick-scrim" onClick={() => setOpenFilter(null)} />
                <div className="task-pick-menu tasks-filter-menu" role="menu">
                  <button className={`task-pick-item${filterChannel ? '' : ' on'}`} role="menuitem" onClick={() => { setFilterChannel(''); setOpenFilter(null) }}>
                    <span className="task-pick-name">All work</span>
                  </button>
                  {channels.map(([id, label]) => (
                    <button
                      key={id}
                      className={`task-pick-item${filterChannel === id ? ' on' : ''}`}
                      role="menuitem"
                      onClick={() => { setFilterChannel(id); setOpenFilter(null) }}
                    >
                      <span className="task-pick-name">{label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {(filterWho || filterCampaign || filterChannel) && (
          <button className="tasks-filter-clear" onClick={() => { setFilterWho(''); setFilterCampaign(''); setFilterChannel('') }}>
            Clear filters
          </button>
        )}
      </div>

      <div className="task-grid task-colhead">
        {/* No label: every row is a task, so "Task" named the table rather than the column, and it
            was the one header here that is not a grouping control. */}
        <div className="task-cell task-cell-name" aria-hidden="true" />
        <ColHead label="Due date" col="due" />
        <ColHead label="Folder" col="folder" />
        <ColHead label="Campaign" col="campaign" className="task-cell-campaign" />
        <ColHead label="Assigned to" col="assignee" />
      </div>
      </div>

      {allTasks.length === 0 ? (
        <div className="mtx-empty">No tasks for {brand || 'this workspace'} yet. Build a campaign, or add one with “＋ New task”.</div>
      ) : visible.length === 0 ? (
        // Matching nothing is a normal thing for a filter to do, and it used to render as an empty
        // page under a header still claiming thirty-one — indistinguishable from broken.
        <div className="mtx-empty">
          Nothing matches these filters.{' '}
          <button className="tasks-filter-clear" onClick={() => { setFilterWho(''); setFilterCampaign(''); setFilterChannel('') }}>
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {groups.map(([bucket, list]) => {
            // Grouped by due date the "Overdue" heading says it. Grouped by campaign or assignee
            // there is no such heading, so each group has to say how much of it is late itself —
            // otherwise the one number on the head counts a campaign's work without saying that
            // half of it has already slipped.
            const late = groupBy === 'due' ? 0 : list.filter((t) => t.due && t.due < today).length
            return (
              <div key={bucket} className="task-group">
                <div className={`task-group-head${bucket === 'Overdue' ? ' overdue' : ''}`}>
                  {bucket} <span className="task-group-count">{list.length}</span>
                  {late > 0 && (
                    <span className="task-group-late" title={`${late} overdue`}>
                      {late} late
                    </span>
                  )}
                </div>
                {list.map((t) => (t.derived ? assetRow(t) : row(t)))}
              </div>
            )
          })}
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
