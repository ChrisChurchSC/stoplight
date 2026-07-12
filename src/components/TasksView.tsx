import { useEffect, useMemo, useRef, useState } from 'react'
import { recordTint } from '../domain/records'
import { useTrafficStore } from '../store/useTrafficStore'

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
}

const KEY = 'stoplight.tasks.v1'
// The signed-in user, used as the default assignee for a new task.
const ME = 'Chris Church'

// Normalize a persisted task: `record` used to be a free-text string, so migrate any old value.
const normRecord = (r: unknown): TaskRecord | null =>
  r && typeof r === 'object' && 'name' in r ? (r as TaskRecord) : typeof r === 'string' && r ? { id: '', name: r } : null

const load = (): Task[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return (raw as Task[]).map((t) => ({ ...t, record: normRecord(t.record) }))
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
  const [tasks, setTasks] = useState<Task[]>(() => load())
  const [editDue, setEditDue] = useState<string | null>(null)
  const [pickRec, setPickRec] = useState<string | null>(null)
  const focusId = useRef<string | null>(null)
  const today = localDate()

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(tasks))
  }, [tasks])

  const openCount = tasks.filter((t) => !t.done).length

  // Group the open tasks into due-date buckets (done tasks fall to their own section at the end).
  const groups = useMemo(() => {
    const open = tasks.filter((t) => !t.done)
    const map = new Map<Bucket, Task[]>()
    for (const b of BUCKETS) map.set(b, [])
    for (const t of open) map.get(bucketOf(t.due, today))!.push(t)
    for (const list of map.values())
      list.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt)
    return BUCKETS.map((b) => [b, map.get(b)!] as const).filter(([, list]) => list.length > 0)
  }, [tasks, today])
  const doneTasks = useMemo(() => tasks.filter((t) => t.done), [tasks])

  const patch = (id: string, p: Partial<Task>) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t)))
  const remove = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id))
  const addTask = () => {
    const id = freshId()
    focusId.current = id
    setTasks((prev) => [...prev, { id, text: '', due: today, record: null, assignee: ME, done: false, createdAt: Date.now() }])
  }

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
        <input
          className="task-input task-name-input"
          value={t.text}
          placeholder="Task name"
          ref={(el) => {
            if (el && focusId.current === t.id) {
              el.focus()
              focusId.current = null
            }
          }}
          onChange={(e) => patch(t.id, { text: e.target.value })}
        />
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
        <button className={`task-chip task-chip-btn${t.record ? '' : ' empty'}`} onClick={() => setPickRec(t.id)} title="Link a company">
          {t.record ? (
            <>
              <Avatar name={t.record.name} />
              <span className="task-chip-name">{t.record.name}</span>
            </>
          ) : (
            <span className="task-chip-name muted">—</span>
          )}
        </button>
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

  return (
    <div className="mtx tasks-view">
      <header className="mtx-head tasks-head">
        <h2>Tasks</h2>
        <span className="mtx-sub">{openCount > 0 ? `${openCount} open` : 'A running to-do list for this workspace'}</span>
        <button className="tasks-new" onClick={addTask}>
          ＋ New task
        </button>
      </header>

      <div className="tasks-toolbar">Sorted by Due date</div>

      <div className="task-grid task-colhead">
        <div className="task-cell task-cell-name">Task</div>
        <div className="task-cell">Due date</div>
        <div className="task-cell">Record</div>
        <div className="task-cell">Assigned to</div>
      </div>

      {tasks.length === 0 ? (
        <div className="mtx-empty">No tasks yet. Add one with “＋ New task”.</div>
      ) : (
        <>
          {groups.map(([bucket, list]) => (
            <div key={bucket} className="task-group">
              <div className={`task-group-head${bucket === 'Overdue' ? ' overdue' : ''}`}>
                {bucket} <span className="task-group-count">{list.length}</span>
              </div>
              {list.map(row)}
            </div>
          ))}
          {doneTasks.length > 0 && (
            <div className="task-group">
              <div className="task-group-head">
                Done <span className="task-group-count">{doneTasks.length}</span>
              </div>
              {doneTasks.map(row)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
