import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { askClaude } from '../adapters/ask/claudeAsk'
import { buildAskContext } from '../domain/askClaude'
import { buildBrandReport } from '../domain/reportGen'
import { newAudience } from '../domain/audiences'
import { GUIDED_SETUP_INTRO, GUIDED_SETUP_SEED, GUIDED_SETUP_STEPS, isSetupRequest } from '../domain/guidedSetup'
import { Markdown } from '../lib/miniMarkdown'
import { rowInScope } from '../lib/scope'
import { useHomeCanvases } from '../lib/useHomeCanvases'
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
  /** Set on the message that announces a just-generated report, to render a "View report" link. */
  reportId?: string
  reportBrand?: string
  /** Set on the completion message of the guided setup, to render next-step buttons. */
  setupDone?: boolean
  /** Set on a dead-end message to offer starting the guided setup. */
  offerSetup?: boolean
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
  const addReport = useTrafficStore((s) => s.addReport)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setPage = useTrafficStore((s) => s.setPage)
  // Setup actions — the guided flow creates real records as the user answers.
  const addClient = useTrafficStore((s) => s.addClient)
  const addBrandRecord = useTrafficStore((s) => s.addBrandRecord)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const openFlow = useTrafficStore((s) => s.openFlow)
  const { brands } = useHomeCanvases()

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
  // When we've asked "which brand?" for a report, the next message is read as the brand answer.
  const awaitingBrandRef = useRef(false)
  // Non-null while the guided setup is running: which step we're on + the brand named so far.
  const setupRef = useRef<{ step: number; brand: string; audience?: string } | null>(null)

  // Brands you can report on (canvas brands ∪ any brand with segments), minus the Drafts catch-all.
  const brandList = useMemo(
    () => [...new Set([...brands.map((b) => b.name), ...Object.keys(clientAudiences)])].filter((n) => n && n !== 'Drafts'),
    [brands, clientAudiences],
  )
  // Does this message read as a request to generate a report?
  const isReportRequest = (t: string): boolean =>
    /\breports?\b/i.test(t) || (/\banaly[sz]e?\b/i.test(t) && /\blibrary\b/i.test(t))
  // Find a brand named anywhere in the text (exact wins, else the longest name it contains).
  const resolveBrand = (t: string): string | null => {
    const lc = t.toLowerCase()
    let best: string | null = null
    for (const name of brandList) {
      const n = name.toLowerCase()
      if (lc === n) return name
      if (lc.includes(n) && (!best || n.length > best.length)) best = name
    }
    return best
  }
  // Build + save the report for a brand, updating the pending assistant message to announce it.
  const doGenerate = async (brand: string, asstId: string) => {
    setMessages((m) =>
      m.map((x) =>
        x.id === asstId
          ? { ...x, busy: true, steps: [
              { kind: 'assets', label: `Reading ${brand}'s library` },
              { kind: 'segments', label: `Scanning ${brand}'s segments` },
            ] }
          : x,
      ),
    )
    await new Promise((r) => setTimeout(r, 550))
    const scopedRows = rows.filter((r) => rowInScope(r, { filter: 'all', query: '', clientFilter: brand, campaignFilter: 'all' }))
    const { title, kind, summary, html } = buildBrandReport({ brand, rows: scopedRows, audiences: clientAudiences[brand] ?? [] })
    const id = addReport({ client: brand, title, kind, summary, html })
    setMessages((m) =>
      m.map((x) =>
        x.id === asstId
          ? { ...x, busy: false, steps: undefined, text: `Done — I wrote up **${title}**: ${summary} It's saved to ${brand}'s Reports.`, reportId: id, reportBrand: brand }
          : x,
      ),
    )
  }

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
      { kind: 'segments', label: `Audiences scanned: ${segs}` },
    ]
  }

  // Append a bare assistant / user message (used by the deterministic guided setup, which doesn't
  // use the ask engine's busy/steps machinery).
  const say = (text: string, extra?: Partial<Msg>) =>
    setMessages((m) => [...m, { id: nid(), role: 'assistant', text, ...extra }])
  const sayUser = (text: string) => setMessages((m) => [...m, { id: nid(), role: 'user', text }])

  // Start the guided setup: intro + first question. Clears any pending report handshake.
  const startSetup = () => {
    awaitingBrandRef.current = false
    setupRef.current = { step: 0, brand: '' }
    say(`${GUIDED_SETUP_INTRO}\n\n${GUIDED_SETUP_STEPS[0].prompt('')}`)
    setQ('')
  }

  // Apply one setup answer to the store (creating real records), then ask the next question or finish.
  const handleSetupAnswer = (text: string) => {
    const val = text.trim()
    sayUser(val)
    setQ('')
    const st = setupRef.current!
    const step = GUIDED_SETUP_STEPS[st.step]
    if (!val) {
      say(step.prompt(st.brand))
      return
    }
    if (step.key === 'brand') {
      addClient(val)
      addBrandRecord({ name: val })
      setClientFilter(val)
      st.brand = val
    } else if (step.key === 'oneliner') {
      setClientProfile(st.brand, { oneLiner: val })
    } else if (step.key === 'audience') {
      const cur = useTrafficStore.getState().clientAudiences[st.brand] ?? []
      setClientAudiences(st.brand, [...cur, newAudience({ name: val })])
      st.audience = val
    }
    const next = st.step + 1
    if (next < GUIDED_SETUP_STEPS.length) {
      st.step = next
      say(GUIDED_SETUP_STEPS[next].prompt(st.brand))
    } else {
      setupRef.current = null
      say(
        `You're set up. **${st.brand}** now has a one-liner and your first audience${st.audience ? `, ${st.audience}` : ''}. From here you can draft a flow, add proof points, or head home to see your coverage.`,
        { setupDone: true },
      )
    }
  }

  const run = async (question: string) => {
    const text = question.trim()
    if (!text || busyRef.current) return

    // Guided setup is a deterministic script that creates records as we go — handle it before the
    // read-only ask/report paths so a task request never dead-ends.
    if (setupRef.current) return handleSetupAnswer(text)
    if (isSetupRequest(text)) {
      sayUser(text)
      startSetup()
      return
    }

    busyRef.current = true
    setBusy(true)
    setQ('')
    const asstId = nid()
    setMessages((m) => [
      ...m,
      { id: nid(), role: 'user', text },
      { id: asstId, role: 'assistant', busy: true, steps: buildSteps() },
    ])

    // Report generation, with the brand resolved in the conversation rather than pre-selected.
    const wasAwaiting = awaitingBrandRef.current
    if (wasAwaiting || isReportRequest(text)) {
      const brand = wasAwaiting ? resolveBrand(text) : clientFilter !== 'all' ? clientFilter : resolveBrand(text)
      if (brand) {
        awaitingBrandRef.current = false
        await doGenerate(brand, asstId)
      } else if (brandList.length) {
        awaitingBrandRef.current = true
        const lead = wasAwaiting ? `I couldn't match that to a brand. ` : ``
        setMessages((m) =>
          m.map((x) => (x.id === asstId ? { ...x, busy: false, steps: undefined, text: `${lead}Which brand should I write this up for? Pick one: ${brandList.join(', ')}.` } : x)),
        )
      } else {
        awaitingBrandRef.current = false
        setMessages((m) =>
          m.map((x) => (x.id === asstId ? { ...x, busy: false, steps: undefined, text: `You don't have any brands set up yet. Want to set one up? I can walk you through it.`, offerSetup: true } : x)),
        )
      }
      busyRef.current = false
      setBusy(false)
      return
    }

    const ctx = buildAskContext(text, scoped, { scope, breakStatus, comments, batchReview, icp, campaigns: campaignList })
    const res = await askClaude(ctx, useTrafficStore.getState().aiModel)
    setMessages((m) =>
      m.map((x) => (x.id === asstId ? { ...x, busy: false, text: res.answer, source: res.live ? 'Claude' : 'offline estimate' } : x)),
    )
    busyRef.current = false
    setBusy(false)
  }

  // Run the seed question once, then clear it so a remount doesn't re-fire it. The "Get started"
  // button seeds a sentinel that launches the guided setup instead of asking a question.
  useEffect(() => {
    if (homeChatSeed && seededRef.current !== homeChatSeed) {
      seededRef.current = homeChatSeed
      if (homeChatSeed === GUIDED_SETUP_SEED) startSetup()
      else void run(homeChatSeed)
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
                  {m.reportId && m.reportBrand && (
                    <button
                      className="hchat-report-open"
                      onClick={() => {
                        setClientFilter(m.reportBrand!)
                        closeHomeChat()
                        setPage('reports')
                      }}
                    >
                      View report →
                    </button>
                  )}
                  {m.offerSetup && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={startSetup}>Get started</button>
                    </div>
                  )}
                  {m.setupDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { closeHomeChat(); openFlow('') }}>Draft a flow</button>
                      <button className="hchat-setup-btn" onClick={() => { closeHomeChat(); setPage('proofpoints') }}>Add proof points</button>
                      <button className="hchat-setup-btn ghost" onClick={closeHomeChat}>Go home</button>
                    </div>
                  )}
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
