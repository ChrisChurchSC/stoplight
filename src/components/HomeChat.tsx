import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { askClaude } from '../adapters/ask/claudeAsk'
import { draftProof } from '../adapters/ask/draftProof'
import { draftAudiences } from '../adapters/ask/draftAudiences'
import { draftMessages } from '../adapters/ask/draftMessages'
import { draftVoices } from '../adapters/ask/draftVoices'
import { buildAskContext } from '../domain/askClaude'
import { buildBrandReport } from '../domain/reportGen'
import { freshRecordId } from '../domain/records'
import { newAudience } from '../domain/audiences'
import type { Message } from '../domain/message'
import { buildAskBrand } from '../lib/askBrand'
import { GUIDED_SETUP_INTRO, GUIDED_SETUP_SEED, GUIDED_SETUP_STEPS, isSetupRequest } from '../domain/guidedSetup'
import type { HomeChatMsg as Msg, HomeChatStep as Step, HomeChatStepKind as StepKind } from '../domain/homeChat'
import { Markdown } from '../lib/miniMarkdown'
import { rowInScope } from '../lib/scope'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The Home conversational chat: a full-page thread opened from the Home ask box. A
 * question posts as a bubble, a "Thinking" block shows what data was read (grounded
 * in the same context the answer uses), the answer streams in, and a sticky composer
 * at the bottom keeps the conversation going. Same grounded askClaude engine as the
 * palette; this is just the multi-turn, full-page surface for it. Each conversation is
 * persisted (see saveHomeChat) so it can be reopened from the sidebar history.
 */

let uid = 0
const nid = () => `hc_${Math.random().toString(36).slice(2)}_${++uid}`

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
  const activeHomeChatId = useTrafficStore((s) => s.activeHomeChatId)
  const closeHomeChat = useTrafficStore((s) => s.closeHomeChat)
  const newHomeChat = useTrafficStore((s) => s.newHomeChat)
  const saveHomeChat = useTrafficStore((s) => s.saveHomeChat)
  const addReport = useTrafficStore((s) => s.addReport)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setPage = useTrafficStore((s) => s.setPage)
  // Setup actions — the guided flow creates real records as the user answers.
  const addClient = useTrafficStore((s) => s.addClient)
  const addBrandRecord = useTrafficStore((s) => s.addBrandRecord)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const addMessage = useTrafficStore((s) => s.addMessage)
  const addVoice = useTrafficStore((s) => s.addVoice)
  const addLibraryItem = useTrafficStore((s) => s.addLibraryItem)
  const setMessagingBrand = useTrafficStore((s) => s.setMessagingBrand)
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
  // The saved-conversation id + created time for THIS thread, so persisting as it grows upserts one
  // record. Set once (on first save) for a new chat, or from the saved chat when reopened.
  const chatIdRef = useRef<string | null>(null)
  const createdAtRef = useRef<number>(0)
  // When we've asked "which brand?" for a report, the next message is read as the brand answer.
  const awaitingBrandRef = useRef(false)
  // Non-null while the guided setup is running: which step we're on + the brand named so far.
  const setupRef = useRef<{ step: number; brand: string; audience?: string } | null>(null)
  // The last thing the chat DID (e.g. 'proof'), so a follow-up like "more" continues that action.
  const lastActionRef = useRef<string | null>(null)

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

  // Start the guided setup: intro + first question. Clears any pending report handshake. If the
  // current brand is ALREADY set up (has a one-liner and an audience), don't restart from scratch —
  // offer to extend it instead, so "get started" on an existing brand doesn't loop to "what's your
  // brand called?".
  const startSetup = (forceNew = false) => {
    awaitingBrandRef.current = false
    setQ('')
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    const profile = (brand && brand !== 'all' ? store.clientProfiles[brand] : undefined) as { oneLiner?: string } | undefined
    const hasAudiences = brand && brand !== 'all' && (store.clientAudiences[brand]?.length ?? 0) > 0
    if (!forceNew && brand && brand !== 'all' && (profile?.oneLiner || hasAudiences)) {
      say(
        `**${brand}** is already set up. Want me to add more audiences, draft proof points, or draft a flow? (Say "new brand" to set up a different one.)`,
        { setupDone: true },
      )
      return
    }
    setupRef.current = { step: 0, brand: '' }
    say(`${GUIDED_SETUP_INTRO}\n\n${GUIDED_SETUP_STEPS[0].prompt('')}`)
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

  // Draft proof points for the active brand, grounded in the FULL brand context (its description on
  // the brand record + profile + audiences), add them to the brand's library, and report them in the
  // chat. Passes the existing proof points so repeat calls ("more") produce new, distinct ones.
  // Falls back to a small heuristic set when the AI isn't available.
  const draftProofPoints = async () => {
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    if (!brand || brand === 'all') { closeHomeChat(); setPage('proofpoints'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { oneLiner?: string; industry?: string }
    // The rich brand context (positioning, differentiator, objective, …) lives on the brand record.
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const audiences = (store.clientAudiences[brand] ?? []).map((a) => a.name)
    setMessagingBrand(brand)
    const existing = (useTrafficStore.getState().library.rtbs ?? []).map((r) => r.label).filter(Boolean)
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'records', label: `Drafting proof points for ${brand}` }] }])
    const proof = await draftProof({
      brand,
      oneLiner: profile.oneLiner,
      industry: profile.industry || rec.industry,
      positioning: rec.positioning,
      descriptor: rec.descriptor,
      keyMessage: rec.keyMessage,
      differentiator: rec.differentiator,
      businessObjective: rec.businessObjective,
      audiences,
      existing,
    })
    proof.forEach((p) => addLibraryItem('rtbs', { id: freshRecordId('lrtb'), label: p.label, detail: p.detail, approved: false }))
    const list = proof.map((p) => `- **${p.label}**: ${p.detail}`).join('\n')
    const more = existing.length > 0
    setMessages((m) =>
      m.map((x) =>
        x.id === id
          ? { ...x, busy: false, steps: undefined, text: `I drafted ${proof.length} ${more ? 'more ' : ''}proof point${proof.length === 1 ? '' : 's'} for **${brand}** and saved them:\n\n${list}\n\nAsk for more, or open Proof points to edit them.`, proofDone: true }
          : x,
      ),
    )
    lastActionRef.current = 'proof'
  }

  // Draft target audiences for the active brand from its description, add them as real audience
  // records, and report them in the chat. Passes existing audience names so "more" gives new ones.
  const addAudiences = async () => {
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    if (!brand || brand === 'all') { closeHomeChat(); setPage('segments'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { oneLiner?: string; industry?: string }
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const current = store.clientAudiences[brand] ?? []
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'segments', label: `Building audiences for ${brand}` }] }])
    const drafted = await draftAudiences({
      brand,
      oneLiner: profile.oneLiner,
      positioning: rec.positioning,
      descriptor: rec.descriptor,
      differentiator: rec.differentiator,
      businessObjective: rec.businessObjective,
      industry: profile.industry || rec.industry,
      existing: current.map((a) => a.name),
    })
    const additions = drafted.map((d) =>
      newAudience({ name: d.name, definition: d.definition, role: d.role, pains: d.pains, messageAngle: d.messageAngle, outcome: d.outcome }),
    )
    setClientAudiences(brand, [...(useTrafficStore.getState().clientAudiences[brand] ?? []), ...additions])
    const list = drafted.map((d) => `- **${d.name}**: ${d.definition}`).join('\n')
    setMessages((m) =>
      m.map((x) =>
        x.id === id
          ? { ...x, busy: false, steps: undefined, text: `I added ${drafted.length} audience${drafted.length === 1 ? '' : 's'} to **${brand}**:\n\n${list}\n\nAsk for more, draft proof points, or open Audiences to refine them.`, audienceDone: true }
          : x,
      ),
    )
    lastActionRef.current = 'audience'
  }

  // Draft reusable messages (angles) for the active brand, tied to its audiences and stages, add them
  // as Message records, and report them. Passes existing message names so "more" gives new ones.
  const draftBrandMessages = async () => {
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    if (!brand || brand === 'all') { closeHomeChat(); setPage('messages'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { oneLiner?: string; industry?: string }
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const audiences = (store.clientAudiences[brand] ?? []).map((a) => a.name)
    const existing = store.messages.filter((m) => !m.brand || m.brand === brand).map((m) => m.name)
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'records', label: `Drafting messages for ${brand}` }] }])
    const drafted = await draftMessages({ brand, oneLiner: profile.oneLiner, positioning: rec.positioning, descriptor: rec.descriptor, differentiator: rec.differentiator, businessObjective: rec.businessObjective, industry: profile.industry || rec.industry, audiences, existing })
    drafted.forEach((d) =>
      addMessage({ brand, name: d.name, angle: d.angle, audience: d.audience, pillar: d.pillar, stage: (['awareness', 'consideration', 'conversion'].includes(d.stage) ? d.stage : '') as Message['stage'] }),
    )
    const list = drafted.map((d) => `- **${d.name}** (${d.audience}, ${d.stage}): ${d.angle}`).join('\n')
    setMessages((m) =>
      m.map((x) => (x.id === id ? { ...x, busy: false, steps: undefined, text: `I drafted ${drafted.length} message${drafted.length === 1 ? '' : 's'} for **${brand}**:\n\n${list}\n\nAsk for more, or open Messages to refine them.`, messageDone: true } : x)),
    )
    lastActionRef.current = 'message'
  }

  // Define brand voice(s) for the active brand and add them as Voice records.
  const addBrandVoices = async () => {
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    if (!brand || brand === 'all') { closeHomeChat(); setPage('voices'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { oneLiner?: string; industry?: string }
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const existing = store.voices.filter((v) => !v.brand || v.brand === brand).map((v) => v.name)
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'records', label: `Defining voice for ${brand}` }] }])
    const drafted = await draftVoices({ brand, oneLiner: profile.oneLiner, positioning: rec.positioning, descriptor: rec.descriptor, differentiator: rec.differentiator, businessObjective: rec.businessObjective, industry: profile.industry || rec.industry, existing })
    drafted.forEach((d) => addVoice({ brand, name: d.name, summary: d.summary, tone: d.tone, dos: d.dos, donts: d.donts, sample: d.sample, useFor: d.useFor, status: 'active' }))
    const list = drafted.map((d) => `- **${d.name}** (${d.tone}): ${d.summary}`).join('\n')
    setMessages((m) =>
      m.map((x) => (x.id === id ? { ...x, busy: false, steps: undefined, text: `I added ${drafted.length} ${drafted.length === 1 ? 'voice' : 'voices'} to **${brand}**:\n\n${list}\n\nAsk for more, or open Voices to refine them.`, voiceDone: true } : x)),
    )
    lastActionRef.current = 'voice'
  }

  const run = async (question: string) => {
    const text = question.trim()
    if (!text || busyRef.current) return

    // Guided setup is a deterministic script that creates records as we go — handle it before the
    // read-only ask/report paths so a task request never dead-ends.
    if (setupRef.current) return handleSetupAnswer(text)

    // Take real action for "do" requests instead of falling through to the read-only ask engine.
    const doVerb = /\b(draft|add|create|generate|write|give|need|make|build|develop|define|more|another|additional)\b/i.test(text)
    const wantsProof = /\bproof\s?points?\b|\brtbs?\b|\breasons?\s+to\s+believe\b/i.test(text) && doVerb
    const wantsAudience = /\baudiences?\b|\bpersonas?\b|\bsegments?\b/i.test(text) && doVerb
    const wantsMessage = /\bmessages?\b|\bangles?\b/i.test(text) && doVerb
    const wantsVoice = /\bvoices?\b|\btone[ -]?of[ -]?voice\b/i.test(text) && doVerb
    const bareMore = text.length <= 40 && /\b(more|another|additional|others?|keep going|again|continue)\b/i.test(text)
    if (wantsAudience || (bareMore && lastActionRef.current === 'audience')) {
      sayUser(text); setQ(''); void addAudiences(); return
    }
    if (wantsMessage || (bareMore && lastActionRef.current === 'message')) {
      sayUser(text); setQ(''); void draftBrandMessages(); return
    }
    if (wantsVoice || (bareMore && lastActionRef.current === 'voice')) {
      sayUser(text); setQ(''); void addBrandVoices(); return
    }
    if (wantsProof || (bareMore && lastActionRef.current === 'proof')) {
      sayUser(text); setQ(''); void draftProofPoints(); return
    }

    if (/\b(new|different|another|a)\s+brand\b/i.test(text)) {
      sayUser(text)
      startSetup(true)
      return
    }
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

    const ctx = buildAskContext(text, scoped, { scope, breakStatus, comments, batchReview, icp, campaigns: campaignList, brand: buildAskBrand(clientFilter) })
    const res = await askClaude(ctx, useTrafficStore.getState().aiModel)
    setMessages((m) =>
      m.map((x) => (x.id === asstId ? { ...x, busy: false, text: res.answer, source: res.live ? 'Claude' : 'offline estimate' } : x)),
    )
    busyRef.current = false
    setBusy(false)
  }

  // Initialize the thread once per conversation (the component is keyed by homeChatSession, so it
  // remounts on open/new/reopen). Reopening a saved chat hydrates its messages; a seeded question
  // runs it (or launches the guided setup); otherwise it's a blank new chat.
  useEffect(() => {
    if (activeHomeChatId) {
      const saved = useTrafficStore.getState().homeChats.find((c) => c.id === activeHomeChatId)
      if (saved) {
        chatIdRef.current = saved.id
        createdAtRef.current = saved.createdAt
        seededRef.current = 'loaded'
        setMessages(saved.messages)
      }
      return
    }
    if (homeChatSeed && seededRef.current !== homeChatSeed) {
      seededRef.current = homeChatSeed
      if (homeChatSeed === GUIDED_SETUP_SEED) startSetup()
      else void run(homeChatSeed)
      useTrafficStore.setState({ homeChatSeed: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist the conversation as it grows (once it has a user message and the turn has settled), so
  // it shows in the sidebar history and survives a reload. Upserts one record by chatIdRef.
  useEffect(() => {
    const firstUser = messages.find((m) => m.role === 'user')
    if (!firstUser || messages.some((m) => m.busy)) return
    if (!chatIdRef.current) chatIdRef.current = `chat_${nid()}`
    if (!createdAtRef.current) createdAtRef.current = Date.now()
    const persisted: Msg[] = messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      source: m.source,
      reportId: m.reportId,
      reportBrand: m.reportBrand,
      setupDone: m.setupDone,
      offerSetup: m.offerSetup,
      proofDone: m.proofDone,
      audienceDone: m.audienceDone,
      messageDone: m.messageDone,
      voiceDone: m.voiceDone,
    }))
    saveHomeChat({
      id: chatIdRef.current,
      title: (firstUser.text || 'Chat').slice(0, 60),
      messages: persisted,
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="hchat">
      <header className="hchat-top">
        <button className="hchat-back" onClick={closeHomeChat}>
          ← Home
        </button>
        <button className="hchat-new" onClick={newHomeChat} title="Start a new chat">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          New chat
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
                      <button className="hchat-setup-btn" onClick={() => startSetup()}>Get started</button>
                    </div>
                  )}
                  {m.setupDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={addAudiences}>Add audiences</button>
                      <button className="hchat-setup-btn" onClick={draftBrandMessages}>Draft messages</button>
                      <button className="hchat-setup-btn" onClick={addBrandVoices}>Add voices</button>
                      <button className="hchat-setup-btn" onClick={draftProofPoints}>Draft proof points</button>
                      <button className="hchat-setup-btn" onClick={() => { closeHomeChat(); openFlow('') }}>Draft a flow</button>
                      <button className="hchat-setup-btn ghost" onClick={closeHomeChat}>Go home</button>
                    </div>
                  )}
                  {m.proofDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { closeHomeChat(); setPage('proofpoints') }}>View proof points</button>
                    </div>
                  )}
                  {m.audienceDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { closeHomeChat(); setPage('segments') }}>View audiences</button>
                    </div>
                  )}
                  {m.messageDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { closeHomeChat(); setPage('messages') }}>View messages</button>
                    </div>
                  )}
                  {m.voiceDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { closeHomeChat(); setPage('voices') }}>View voices</button>
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
        <div className="hchat-actions">
          {clientFilter && clientFilter !== 'all' ? (
            <>
              <button className="hchat-action" disabled={busy} onClick={() => void addAudiences()}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><path d="M4 20a5 5 0 0 1 10 0" /><path d="M19 8v6M22 11h-6" /></svg>
                Add audiences
              </button>
              <button className="hchat-action" disabled={busy} onClick={() => void draftBrandMessages()}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H8l-4 3z" /></svg>
                Draft messages
              </button>
              <button className="hchat-action" disabled={busy} onClick={() => void addBrandVoices()}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H8l-4 3z" /><path d="M9 10v2M12 8.5v5M15 10v2" /></svg>
                Add voices
              </button>
              <button className="hchat-action" disabled={busy} onClick={() => void draftProofPoints()}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 6" /></svg>
                Draft proof points
              </button>
              <button className="hchat-action" disabled={busy} onClick={() => { closeHomeChat(); openFlow('') }}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
                Draft a flow
              </button>
              <button className="hchat-action ghost" disabled={busy} onClick={() => startSetup(true)}>New brand</button>
            </>
          ) : (
            <button className="hchat-action" disabled={busy} onClick={() => startSetup()}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              Get started
            </button>
          )}
        </div>
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
