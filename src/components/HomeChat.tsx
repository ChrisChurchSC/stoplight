import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { askClaude } from '../adapters/ask/claudeAsk'
import { buildAskContext } from '../domain/askClaude'
import { Markdown } from '../lib/miniMarkdown'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The Home conversational chat: a full-page thread opened from the Home ask box. A
 * question posts as a bubble, a "Thinking" block shows what data was read (grounded
 * in the same context the answer uses), the answer streams in, and a sticky composer
 * at the bottom keeps the conversation going. Same grounded askClaude engine as the
 * palette; this is just the multi-turn, full-page surface for it.
 */

type StepKind = 'assets' | 'records' | 'segments'
interface Step {
  kind: StepKind
  label: string
}
interface Msg {
  id: string
  role: 'user' | 'assistant'
  text?: string
  steps?: Step[]
  source?: string
  busy?: boolean
}

let uid = 0
const nid = () => `hc${++uid}`

const STEP_ICON: Record<StepKind, ReactNode> = {
  assets: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.3" />
      <rect x="13" y="4" width="7" height="7" rx="1.3" />
      <rect x="4" y="13" width="7" height="7" rx="1.3" />
      <rect x="13" y="13" width="7" height="7" rx="1.3" />
    </>
  ),
  records: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8" cy="11" r="2" />
      <path d="M13 9h5M13 13h5M6 16h12" />
    </>
  ),
  segments: (
    <>
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="m2 13 10 5 10-5" />
    </>
  ),
}

export function HomeChat() {
  const rows = useTrafficStore((s) => s.rows)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const comments = useTrafficStore((s) => s.comments)
  const batchReview = useTrafficStore((s) => s.batchReview)
  const icp = useTrafficStore((s) => s.icp)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const companies = useTrafficStore((s) => s.companies)
  const people = useTrafficStore((s) => s.people)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const homeChatSeed = useTrafficStore((s) => s.homeChatSeed)
  const closeHomeChat = useTrafficStore((s) => s.closeHomeChat)

  const [messages, setMessages] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set())
  const toggleSteps = (id: string) =>
    setOpenSteps((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const seededRef = useRef<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)

  const scope =
    (clientFilter === 'all' ? 'All brands' : clientFilter) +
    (campaignFilter === 'all' ? '' : ` · ${campaignFilter.replace(`${clientFilter} — `, '')}`)

  const scoped = useMemo(
    () => rows.filter((r) => rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter })),
    [rows, clientFilter, campaignFilter],
  )

  const buildSteps = (): Step[] => {
    const recs = companies.length + people.length
    const segs = Object.values(clientAudiences).reduce((n, a) => n + a.length, 0)
    return [
      { kind: 'assets', label: `Campaign assets read: ${scoped.length}` },
      { kind: 'records', label: `Records retrieved: ${recs}` },
      { kind: 'segments', label: `Segments scanned: ${segs}` },
    ]
  }

  const run = async (question: string) => {
    const text = question.trim()
    if (!text || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setQ('')
    const asstId = nid()
    setMessages((m) => [
      ...m,
      { id: nid(), role: 'user', text },
      { id: asstId, role: 'assistant', busy: true, steps: buildSteps() },
    ])
    const ctx = buildAskContext(text, scoped, { scope, breakStatus, comments, batchReview, icp, campaigns: campaignList })
    const res = await askClaude(ctx)
    setMessages((m) =>
      m.map((x) => (x.id === asstId ? { ...x, busy: false, text: res.answer, source: res.live ? 'Claude' : 'offline estimate' } : x)),
    )
    busyRef.current = false
    setBusy(false)
  }

  // Run the seed question once, then clear it so a remount doesn't re-fire it.
  useEffect(() => {
    if (homeChatSeed && seededRef.current !== homeChatSeed) {
      seededRef.current = homeChatSeed
      void run(homeChatSeed)
      useTrafficStore.setState({ homeChatSeed: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeChatSeed])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="hchat">
      <header className="hchat-top">
        <button className="hchat-back" onClick={closeHomeChat}>
          ← Home
        </button>
      </header>

      <div className="hchat-thread">
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="hchat-user">
              <span className="hchat-bubble">{m.text}</span>
            </div>
          ) : (
            <div key={m.id} className="hchat-asst">
              {m.steps &&
                (m.busy ? (
                  <div className="hchat-think">
                    <div className="hchat-think-h">Thinking</div>
                    {m.steps.map((s, i) => (
                      <div key={i} className="hchat-step">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          {STEP_ICON[s.kind]}
                        </svg>
                        {s.label}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="hchat-think">
                    <button className="hchat-think-toggle" onClick={() => toggleSteps(m.id)}>
                      {m.steps.length} {m.steps.length === 1 ? 'source' : 'sources'} used
                      <span className={`hchat-chev${openSteps.has(m.id) ? ' open' : ''}`}>›</span>
                    </button>
                    {openSteps.has(m.id) &&
                      m.steps.map((s, i) => (
                        <div key={i} className="hchat-step">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                            {STEP_ICON[s.kind]}
                          </svg>
                          {s.label}
                        </div>
                      ))}
                  </div>
                ))}
              {m.busy ? (
                <div className="hchat-typing" aria-label="Thinking">
                  <span />
                  <span />
                  <span />
                </div>
              ) : (
                <>
                  <Markdown text={m.text ?? ''} className="hchat-answer" />
                  {m.source && <div className="hchat-source">{m.source}</div>}
                </>
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <div className="hchat-composer">
        <div className="hchat-box">
          <textarea
            className="hchat-input"
            placeholder="Ask anything…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void run(q)
              }
            }}
            rows={2}
            autoFocus
          />
          <div className="hchat-box-foot">
            <span className="hchat-scope">{scope}</span>
            <span className="hchat-model">Auto</span>
            <button className="hchat-send" onClick={() => run(q)} disabled={!q.trim() || busy} aria-label="Send">
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
