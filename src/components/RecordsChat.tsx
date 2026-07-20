import { useEffect, useMemo, useRef, useState } from 'react'
import { Markdown } from '../lib/miniMarkdown'
import type { RecordField } from '../domain/records'
import { generateRecordEdit } from '../adapters/ask/generateRecordEdit'
import {
  describeRecordCommand,
  matchRowIds,
  type RecordAgentContext,
  type RecordChatMsg,
  type RecordCommand,
  type RecordFieldSpec,
} from '../domain/recordsAgent'
import { useTrafficStore } from '../store/useTrafficStore'
import { InfoTip } from './InfoTip'

/**
 * The Records-table AI assistant — the flow-canvas chat, brought to the Records pages. Build
 * mode proposes add/update/delete/bulk commands (Apply / Discard); Analyze answers questions
 * about the rows in view without changing anything. Self-contained: it owns the conversation,
 * calls the agent, and applies approved commands through the same add/update/delete the table
 * uses. Reuses the flow chat's `fchat-*` styles so it reads identically.
 */

type Row = { id: string } & Record<string, unknown>

const SparkIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
  </svg>
)
const AnalyzeIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" />
  </svg>
)

let uid = 0
const nid = () => `rc${++uid}`

export function RecordsChat({
  recordType,
  noun,
  brand,
  fields,
  statuses,
  fieldOptions,
  rows,
  onAdd,
  onUpdate,
  onDelete,
}: {
  recordType: string
  noun: [string, string]
  brand: string
  fields: RecordField[]
  statuses: string[]
  fieldOptions?: Record<string, string[]>
  rows: Row[]
  onAdd: () => string | void
  onUpdate: (id: string, patch: Partial<Row>) => void
  onDelete: (id: string) => void
}) {
  const collapsed = useTrafficStore((s) => s.recordsChatCollapsed)
  const setCollapsed = useTrafficStore((s) => s.setRecordsChatCollapsed)
  const [messages, setMessages] = useState<RecordChatMsg[]>([])
  const [q, setQ] = useState('')
  const [intent, setIntent] = useState<'build' | 'analyze'>('build')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const threadRef = useRef<HTMLDivElement>(null)

  // Reset the thread when you switch record type or brand — a chat is scoped to one table.
  const scopeKey = `${brand}·${recordType}`
  const lastScope = useRef(scopeKey)
  useEffect(() => {
    if (lastScope.current !== scopeKey) {
      lastScope.current = scopeKey
      setMessages([])
    }
  }, [scopeKey])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  // The editable field specs the agent may set (status/ref carry their allowed options).
  const fieldSpecs = useMemo<RecordFieldSpec[]>(
    () =>
      fields
        .filter((f) => f.kind !== 'name' || true)
        .map((f) => ({
          key: f.key,
          label: f.label,
          kind: f.kind,
          options: f.kind === 'status' ? statuses : f.kind === 'ref' ? fieldOptions?.[f.key] : undefined,
        })),
    [fields, statuses, fieldOptions],
  )

  // Flatten the current rows to string maps (name + field values), with the real id attached, so
  // the agent can reference them and the apply step can resolve matches back to ids.
  const flatRows = useMemo(
    () =>
      rows.map((r) => {
        const out: Record<string, string> & { __id: string } = { __id: r.id, name: String((r as Record<string, unknown>).name ?? '') }
        for (const f of fields) {
          const v = (r as Record<string, unknown>)[f.key]
          if (v != null && v !== '') out[f.key] = String(v)
        }
        return out
      }),
    [rows, fields],
  )

  const applyCommands = (cmds: RecordCommand[]) => {
    const keyset = new Set(fields.map((f) => f.key))
    const clean = (m: Record<string, string>) => {
      const o: Record<string, string> = {}
      for (const [k, v] of Object.entries(m)) if (keyset.has(k)) o[k] = v
      return o
    }
    for (const cmd of cmds) {
      if (cmd.op === 'add') {
        const id = onAdd()
        if (typeof id === 'string') onUpdate(id, clean(cmd.fields) as Partial<Row>)
      } else if (cmd.op === 'update') {
        for (const id of matchRowIds(cmd.match, flatRows)) onUpdate(id, clean(cmd.set) as Partial<Row>)
      } else if (cmd.op === 'delete') {
        for (const id of matchRowIds(cmd.match, flatRows)) onDelete(id)
      } else if (cmd.op === 'bulkSet') {
        const targets = flatRows.filter((r) => {
          if (!cmd.where) return true
          const val = r[cmd.where.field] ?? ''
          if (cmd.where.empty) return !val
          return val.trim().toLowerCase() === (cmd.where.equals ?? '').trim().toLowerCase()
        })
        for (const r of targets) onUpdate(r.__id, clean(cmd.set) as Partial<Row>)
      }
    }
  }

  const run = async (text: string, useIntent: 'build' | 'analyze') => {
    const t = text.trim()
    if (!t || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setQ('')
    const asstId = nid()
    setMessages((m) => [...m, { id: nid(), role: 'user', text: t }, { id: asstId, role: 'assistant', text: '' }])

    const ctx: RecordAgentContext = {
      recordType,
      noun: noun[0],
      brand,
      intent: useIntent,
      fields: fieldSpecs,
      records: flatRows.map(({ __id, ...rest }) => rest),
      message: t,
      history: messages.slice(-6).map((x) => ({ role: x.role, text: x.text })),
    }
    const res = await generateRecordEdit(ctx)
    const cmds = useIntent === 'build' ? res.commands : []
    setMessages((m) =>
      m.map((x) =>
        x.id === asstId
          ? {
              ...x,
              text: res.reply,
              live: res.live,
              commands: cmds.length ? cmds : undefined,
              suggestions: cmds.length ? cmds.map((c) => describeRecordCommand(c, noun[0])) : undefined,
            }
          : x,
      ),
    )
    busyRef.current = false
    setBusy(false)
  }

  const apply = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId)
    if (!msg?.commands) return
    applyCommands(msg.commands)
    setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, resolved: 'applied' } : x)))
  }
  const discard = (msgId: string) =>
    setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, resolved: 'discarded' } : x)))

  const send = () => run(q, intent)

  const EXAMPLES =
    intent === 'build'
      ? [
          { title: `Add a ${noun[0]}`, desc: `Create a new ${noun[0]} with the fields filled in.`, prompt: `Add a ${noun[0]}` },
          { title: 'Fill the gaps', desc: 'Set a sensible owner on every row missing one.', prompt: 'Set the owner to Chris on every row that has none' },
          { title: 'Clean up', desc: 'Standardize a field across the table.', prompt: `Tidy up these ${noun[1]}` },
        ]
      : [
          { title: "What's missing?", desc: 'Which rows have empty key fields.', prompt: `Which ${noun[1]} are missing important fields?` },
          { title: 'Summarize', desc: 'A quick read on the table by status.', prompt: `Summarize these ${noun[1]} by status` },
          { title: 'Spot duplicates', desc: 'Find likely duplicate rows.', prompt: `Are there any duplicate ${noun[1]}?` },
        ]

  if (collapsed) {
    return (
      <div className="fchat-rail">
        <button className="fchat-rail-btn" title="Open records assistant" aria-label="Open records assistant" onClick={() => setCollapsed(false)}>
          <span className="fchat-spark" aria-hidden="true">✦</span>
        </button>
      </div>
    )
  }

  return (
    <aside className="fchat">
      <header className="fchat-head">
        <span className="fchat-spark" aria-hidden="true">✦</span>
        <span className="fchat-title">{recordType} assistant</span>
        <InfoTip term="recordsAssistant" />
        <span className="fchat-beta">Beta</span>
        <div className="fchat-head-actions">
          <button className="fchat-hbtn" title="New chat" aria-label="New chat" onClick={() => setMessages([])}>+</button>
          <button className="fchat-hbtn" title="Collapse panel" aria-label="Collapse panel" onClick={() => setCollapsed(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M14 9l-2 3 2 3" />
            </svg>
          </button>
        </div>
      </header>

      <div className="fchat-thread" ref={threadRef}>
        {messages.length === 0 && (
          <div className="fchat-empty">
            <p className="fchat-empty-lead">I&rsquo;m your {recordType.toLowerCase()} assistant.</p>
            <p className="fchat-empty-sub">
              In <strong>Build</strong> I add, edit, and clean up {noun[1]} (you approve each change). In <strong>Analyze</strong> I answer questions about them without changing anything.
            </p>
            <div className="fchat-cards">
              {EXAMPLES.map((ex) => (
                <button key={ex.title} className="fchat-card" disabled={busy} onClick={() => run(ex.prompt, intent)}>
                  <span className="fchat-card-ic" aria-hidden="true">{intent === 'analyze' ? <AnalyzeIco /> : <SparkIco />}</span>
                  <span className="fchat-card-txt">
                    <span className="fchat-card-title">{ex.title}</span>
                    <span className="fchat-card-desc">{ex.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="fchat-user">{m.text}</div>
          ) : (
            <div key={m.id} className="fchat-ai">
              {m.text && <Markdown text={m.text} className="fchat-ai-md" />}
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="fchat-sugg-box">
                  <div className="fchat-sugg-head">{m.resolved ? (m.resolved === 'applied' ? 'Applied' : 'Discarded') : `Suggestions · ${m.suggestions.length}`}</div>
                  <ul className="fchat-sugg-list">
                    {m.suggestions.map((s, i) => (
                      <li key={i} className={`fchat-sugg-item${m.resolved === 'applied' ? ' done' : ''}`}>
                        <span className="fchat-sugg-check" aria-hidden="true">{m.resolved === 'applied' ? '✓' : '•'}</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                  {!m.resolved && (
                    <div className="fchat-sugg-foot">
                      <button className="fchat-sugg-apply" onClick={() => apply(m.id)} disabled={busy}>Apply all</button>
                      <button className="fchat-sugg-discard" onClick={() => discard(m.id)} disabled={busy}>Discard</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ),
        )}
        {busy && (
          <div className="fchat-ai fchat-thinking">
            <span className="fchat-dot" /><span className="fchat-dot" /><span className="fchat-dot" />
          </div>
        )}
      </div>

      <div className="fchat-disclaim">The assistant can make mistakes. Review its suggestions before applying.</div>
      <div className="fchat-composer">
        <div className="fchat-mode">
          <button className={`fchat-mode-btn${intent === 'build' ? ' on' : ''}`} onClick={() => setIntent('build')}>
            <SparkIco /> Build
          </button>
          <button className={`fchat-mode-btn${intent === 'analyze' ? ' on' : ''}`} onClick={() => setIntent('analyze')}>
            <AnalyzeIco /> Analyze
          </button>
        </div>
        <div className="fchat-inputrow">
          <textarea
            className="fchat-input"
            rows={2}
            value={q}
            placeholder={intent === 'build' ? `Describe a change to these ${noun[1]}…` : `Ask about these ${noun[1]}…`}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
          />
          <button className="fchat-send" onClick={send} disabled={busy || !q.trim()} aria-label="Send">↑</button>
        </div>
      </div>
    </aside>
  )
}
