import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { askClaude } from '../adapters/ask/claudeAsk'
import { draftProof } from '../adapters/ask/draftProof'
import { draftAudiences } from '../adapters/ask/draftAudiences'
import { draftMessages } from '../adapters/ask/draftMessages'
import { draftVoices } from '../adapters/ask/draftVoices'
import { draftObjectives } from '../adapters/ask/draftObjectives'
import { draftChannels } from '../adapters/ask/draftChannels'
import { ingestSite } from '../adapters/ask/ingestSite'
import { CHANNELS, CHANNEL_LIST, resolveChannelId } from '../domain/channels'
import { DELIVERABLE_PRESETS, presetByKey } from '../domain/flows'
import type { Deliverable } from '../domain/strategyAssets'
import type { FlowReference } from '../domain/clients'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
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

// The guided build flows, in dependency order. Foundation and Go-to-market are separate sequences
// (matching the sidebar sections); each step offers to draft that piece or skip, then advances.
const FLOW_STEP_KEYS = ['audiences', 'voices', 'proof', 'messages', 'channels', 'objectives'] as const
type FlowStep = (typeof FLOW_STEP_KEYS)[number]
const FOUNDATION_STEPS: FlowStep[] = ['audiences', 'voices', 'proof', 'messages']
const GTM_STEPS: FlowStep[] = ['channels', 'objectives']
const FLOW_PROMPT: Record<FlowStep, { text: string; label: string }> = {
  audiences: { text: `First, your **audiences**, the people you're marketing to. Everything else gets sharper once these exist. Want me to draft a few?`, label: 'Draft audiences' },
  voices: { text: `Now your **brand voice**, how you sound. Want me to define it?`, label: 'Add voices' },
  proof: { text: `**Proof points**, the evidence your messages lean on. Want me to draft some?`, label: 'Draft proof points' },
  messages: { text: `**Messages**, what you say to each audience, in your voice, backed by proof. Want me to draft them?`, label: 'Draft messages' },
  channels: { text: `Now go-to-market. First, **channels**, where you reach each audience. Want me to pick the best-fit ones and set them?`, label: 'Set channels' },
  objectives: { text: `And **objectives**, what to measure and how often to report. Want me to draft them?`, label: 'Draft objectives' },
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
  const setLibraryMode = useTrafficStore((s) => s.setLibraryMode)
  // Setup actions — the guided flow creates real records as the user answers.
  const addClient = useTrafficStore((s) => s.addClient)
  const addBrandRecord = useTrafficStore((s) => s.addBrandRecord)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const addMessage = useTrafficStore((s) => s.addMessage)
  const addVoice = useTrafficStore((s) => s.addVoice)
  const addObjective = useTrafficStore((s) => s.addObjective)
  const importAssets = useTrafficStore((s) => s.importAssets)
  const addCampaign = useTrafficStore((s) => s.addCampaign)
  const setCampaignReferences = useTrafficStore((s) => s.setCampaignReferences)
  const seedCampaignAssets = useTrafficStore((s) => s.seedCampaignAssets)
  const draftCopy = useTrafficStore((s) => s.draftCopy)
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
  // When we've asked for the brand's website (to ingest content), the next message is read as the URL.
  const awaitingSiteRef = useRef(false)
  // Non-null while the guided "build a flow" conversation is running.
  // Flow-build steps: 0 theme, 1 audiences, 2 goal, 3 weeks. audienceIds = the flow's chosen targets.
  const flowBuildRef = useRef<{ step: number; name: string; weeks: number; objectiveId?: string; audienceIds?: string[] } | null>(null)
  // The audiences you're pursuing in go-to-market: scopes channel assignment and the flow-build.
  // null = pursue all. Set when you pick audiences at the start of the GTM flow.
  const gtmPursuedRef = useRef<Set<string> | null>(null)
  // In-progress toggle selection while the GTM audience-pick step is on screen.
  const [gtmAudSel, setGtmAudSel] = useState<Set<string>>(new Set())

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
        `**${brand}** is already set up. Want me to add more audiences, draft proof points, or draft a campaign? (Say "new brand" to set up a different one.)`,
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
        `You're set up. **${st.brand}** now has a one-liner and your first audience${st.audience ? `, ${st.audience}` : ''}. From here you can draft a campaign, add proof points, or head home to see your coverage.`,
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

  // Draft marketing objectives (goal + metric + target framing) for the active brand.
  const draftBrandObjectives = async () => {
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    if (!brand || brand === 'all') { closeHomeChat(); setPage('objectives'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { oneLiner?: string; industry?: string }
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const existing = store.objectives.filter((o) => !o.brand || o.brand === brand).map((o) => o.name)
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'records', label: `Drafting objectives for ${brand}` }] }])
    const { objectives: drafted, reportingCadence } = await draftObjectives({ brand, oneLiner: profile.oneLiner, positioning: rec.positioning, differentiator: rec.differentiator, businessObjective: rec.businessObjective, industry: profile.industry || rec.industry, existing })
    drafted.forEach((d) => addObjective({ brand, name: d.name, metric: d.metric, target: d.target, timeframe: d.timeframe, status: 'planned' }))
    const list = drafted.map((d) => `- **${d.name}** (${d.metric}, ${d.target}, ${d.timeframe})`).join('\n')
    setMessages((m) =>
      m.map((x) => (x.id === id ? { ...x, busy: false, steps: undefined, text: `I drafted ${drafted.length} objective${drafted.length === 1 ? '' : 's'} for **${brand}** and what to measure:\n\n${list}\n\n**Reporting cadence:** ${reportingCadence}\n\nAsk for more, or open Objectives to refine them.`, objectiveDone: true } : x)),
    )
    lastActionRef.current = 'objective'
  }

  // Recommend the channels that fit the brand and assign them to its audiences (which fills in the
  // personalization coverage). The AI only picks from the channels the app supports.
  const setBrandChannels = async () => {
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    if (!brand || brand === 'all') { closeHomeChat(); setPage('channelrecords'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { oneLiner?: string; industry?: string }
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const allAud = store.clientAudiences[brand] ?? []
    // Scope to the audiences you're pursuing (set at the start of go-to-market); default to all.
    const pursued = gtmPursuedRef.current
    const audiences = pursued && pursued.size ? allAud.filter((a) => pursued.has(a.id)) : allAud
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'segments', label: `Choosing channels for ${brand}` }] }])
    // Feed the brand's live traffic mix (connected analytics) so channel picks weight toward what works.
    const perf = (store.brandActuals[brand]?.channels ?? []).map((c) => ({ label: c.label, reach: c.reach, reachUnit: c.reachUnit, engagement: c.engagement }))
    const recs = await draftChannels({ brand, oneLiner: profile.oneLiner, positioning: rec.positioning, businessObjective: rec.businessObjective, industry: profile.industry || rec.industry, audiences: audiences.map((a) => a.name), channelOptions: CHANNEL_LIST.map((c) => c.label), performance: perf.length ? perf : undefined })
    // Resolve recommended labels to channel ids and assign them to the pursued audiences (union with any set).
    const ids = [...new Set(recs.map((r) => resolveChannelId(r.name)).filter((x): x is NonNullable<typeof x> => !!x))]
    if (ids.length && audiences.length) {
      const pursuedIds = new Set(audiences.map((a) => a.id))
      const updated = allAud.map((a) => (pursuedIds.has(a.id) ? { ...a, channels: [...new Set([...(a.channels ?? []), ...ids])] } : a))
      setClientAudiences(brand, updated)
    }
    const label = (rid: string) => CHANNEL_LIST.find((c) => c.id === rid)?.label ?? rid
    const list = recs.map((r) => `- **${r.name}**: ${r.why}`).join('\n')
    const applied = audiences.length
      ? ` I set them on your ${audiences.length} audience${audiences.length === 1 ? '' : 's'} (${ids.map(label).join(', ')}), so your personalization coverage fills in.`
      : ' Add audiences and I can assign these to them.'
    setMessages((m) =>
      m.map((x) => (x.id === id ? { ...x, busy: false, steps: undefined, text: `Here are the channels I'd focus on for **${brand}**:\n\n${list}\n${applied}`, channelDone: true } : x)),
    )
    lastActionRef.current = 'channel'
  }

  // Ingest the brand's real published content (its website pages) into the Library. Needs the brand's
  // website; if it's not on file, ask for it (the next message is read as the URL). Uses a plain-fetch
  // server endpoint (works in production), then importAssets files the pages as Library content.
  const ingestBrandContent = async (urlOverride?: string) => {
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    if (!brand || brand === 'all') { closeHomeChat(); setPage('content'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { website?: string }
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const website = (urlOverride || profile.website || rec.website || '').trim()
    if (!website) {
      awaitingSiteRef.current = true
      say(`What's **${brand}**'s website? Paste the URL and I'll pull your existing content into the Library.`)
      return
    }
    awaitingSiteRef.current = false
    if (urlOverride && !profile.website) setClientProfile(brand, { website })
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'assets', label: `Reading ${website.replace(/^https?:\/\//, '')}` }] }])
    const items = await ingestSite(website)
    if (!items.length) {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, busy: false, steps: undefined, text: `I couldn't read content from ${website}. Double-check the URL, or add content manually in the Library.` } : x)))
      return
    }
    const result = await importAssets(brand, CONTENT_LIBRARY_CAMPAIGN, items, 'site')
    const parts = [`I pulled **${result.imported}** piece${result.imported === 1 ? '' : 's'} of content from ${brand}'s site into your Library`]
    if (result.updated) parts.push(`refreshed ${result.updated}`)
    if (result.skipped) parts.push(`skipped ${result.skipped} already there`)
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, busy: false, steps: undefined, text: `${parts.join(', ')}. Open the Library to review them.`, ingestDone: true } : x)))
    lastActionRef.current = 'ingest'
  }

  // ── The guided "build your foundation" flow: walk the sections in order, drafting or skipping each.
  const runFlowAction = (step: FlowStep): Promise<void> => {
    switch (step) {
      case 'audiences': return addAudiences()
      case 'channels': return setBrandChannels()
      case 'voices': return addBrandVoices()
      case 'proof': return draftProofPoints()
      case 'messages': return draftBrandMessages()
      case 'objectives': return draftBrandObjectives()
    }
  }
  const pushFlowStep = (step: FlowStep) =>
    setMessages((m) => [...m, { id: nid(), role: 'assistant', text: FLOW_PROMPT[step].text, flowStep: step }])
  const advanceFlow = (current: FlowStep) => {
    // Which sequence we're in is determined by the step (foundation and GTM steps don't overlap).
    const inGtm = GTM_STEPS.includes(current)
    const seq = inGtm ? GTM_STEPS : FOUNDATION_STEPS
    const next = seq[seq.indexOf(current) + 1]
    if (next) pushFlowStep(next)
    else if (inGtm)
      say(`Go-to-market is set, channels and objectives. Companies and People are your real target accounts and contacts, so add those in their tables when you have them. Now let's put it all to work. Want to build your first campaign?`, { flowOffer: true })
    else say(`That's your foundation built, audiences, voice, proof points, and messages. Next up: your go-to-market (channels and objectives). Want me to set that up?`, { gtmOffer: true })
  }
  const onFlowStep = async (msgId: string, step: FlowStep, doIt: boolean) => {
    // Hide this step's buttons so it can't be re-triggered, then draft (or skip) and advance.
    setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, flowStep: undefined } : x)))
    if (doIt) await runFlowAction(step)
    advanceFlow(step)
  }
  const startFoundationFlow = () => {
    setQ('')
    say(`Let's build out your foundation in the order that works best. I'll offer each piece, you draft it or skip. You can refine anything later.`)
    pushFlowStep(FOUNDATION_STEPS[0])
  }
  const startGtmFlow = () => {
    setQ('')
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    const auds = store.clientAudiences[brand] ?? []
    gtmPursuedRef.current = null
    // Go-to-market starts with WHO: which audiences you're pursuing. Skip the question if there
    // are none yet (nothing to choose) and go straight to channels.
    if (auds.length < 2) {
      say(`Now your go-to-market: where you'll reach each audience and what you're aiming for. Draft each or skip.`)
      pushFlowStep(GTM_STEPS[0])
      return
    }
    setGtmAudSel(new Set(auds.map((a) => a.id)))
    say(`Go-to-market starts with who you're pursuing. Which of **${brand}**'s audiences is this push focused on? Toggle off any you're not chasing right now, then Continue.`, { audiencePick: auds.map((a) => ({ id: a.id, label: a.name })) })
  }
  const toggleGtmAud = (audId: string) => {
    setGtmAudSel((prev) => {
      const next = new Set(prev)
      if (next.has(audId)) next.delete(audId); else next.add(audId)
      return next
    })
  }
  // Lock in the pursued audiences, then run the rest of go-to-market (channels, objectives) for them.
  const confirmGtmAudiences = () => {
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    const auds = store.clientAudiences[brand] ?? []
    const chosen = gtmAudSel.size ? auds.filter((a) => gtmAudSel.has(a.id)) : auds
    gtmPursuedRef.current = new Set(chosen.map((a) => a.id))
    sayUser(chosen.length === auds.length ? 'Pursuing all audiences' : `Pursuing ${chosen.map((a) => a.name).join(', ')}`)
    say(`Good, we'll focus on ${chosen.length} audience${chosen.length === 1 ? '' : 's'}. Now where you'll reach them, and what you're aiming for. Draft each or skip.`)
    pushFlowStep(GTM_STEPS[0])
  }

  // ── Guided "build a flow" conversation: ask the few things a flow needs, then build it with real
  // assets (deterministic seeding), scoped to the brand's audiences and channels, and open it.
  const startFlowBuild = () => {
    setQ('')
    const brand = useTrafficStore.getState().clientFilter
    if (!brand || brand === 'all') { say(`Set up a brand first and I can build you a campaign. Say "get started".`, { offerSetup: true }); return }
    flowBuildRef.current = { step: 0, name: '', weeks: 4 }
    say(`Let's build a campaign for **${brand}**. What's this campaign about? Give it a theme, like "Q1 inbound push" or "Launch the new pricing".`)
  }
  // The brand's objectives, so the flow-build can ask which goal to aim at (and attach it).
  const flowObjectives = () => {
    const s = useTrafficStore.getState()
    const brand = s.clientFilter
    return s.objectives.filter((o) => !o.brand || o.brand === brand)
  }
  const handleFlowAnswer = async (text: string) => {
    const val = text.trim()
    sayUser(val); setQ('')
    const st = flowBuildRef.current!
    if (st.step === 0) {
      st.name = val || 'New campaign'
      presentFlowAudiences()
      return
    }
    if (st.step === 1) {
      // Audiences are button-driven; a typed reply just means "go with what's selected".
      confirmFlowAudiences()
      return
    }
    if (st.step === 2) {
      // Goal pick fallback: a number, a name match, or "skip".
      const objs = flowObjectives()
      if (!/^(skip|none|no)\b/i.test(val)) {
        const num = parseInt(val.replace(/[^0-9]/g, ''), 10)
        const byNum = num >= 1 && num <= objs.length ? objs[num - 1] : undefined
        const byName = objs.find((o) => o.name.toLowerCase() === val.toLowerCase()) || objs.find((o) => val.toLowerCase().includes(o.name.toLowerCase()))
        const picked = byNum || byName
        if (picked) st.objectiveId = picked.id
      }
      askFlowWeeks()
      return
    }
    // step 3: weeks, then build.
    const n = parseInt(val.replace(/[^0-9]/g, ''), 10)
    st.weeks = n > 0 && n <= 52 ? n : 4
    const { name, weeks, objectiveId, audienceIds } = st
    flowBuildRef.current = null
    await buildFlowFromChat(name, weeks, objectiveId, audienceIds)
  }
  // Suggest one audience and let them pick which this flow targets (keeps flows focused instead of
  // spanning every audience at once). Skips the question when the brand has fewer than two.
  const presentFlowAudiences = () => {
    const st = flowBuildRef.current!
    const auds = useTrafficStore.getState().clientAudiences[useTrafficStore.getState().clientFilter] ?? []
    if (auds.length < 2) {
      st.audienceIds = auds.map((a) => a.id)
      presentFlowGoalOrWeeks()
      return
    }
    st.step = 1
    setGtmAudSel(new Set([auds[0].id])) // suggestion: start with the primary audience, focused
    say(`Who should **${st.name}** target? I'd start with **${auds[0].name}** to keep it focused. Toggle on any others you want, then Continue.`, { audiencePick: auds.map((a) => ({ id: a.id, label: a.name })) })
  }
  const confirmFlowAudiences = () => {
    const st = flowBuildRef.current
    if (!st || st.step !== 1) return
    setQ('')
    const auds = useTrafficStore.getState().clientAudiences[useTrafficStore.getState().clientFilter] ?? []
    const chosen = gtmAudSel.size ? auds.filter((a) => gtmAudSel.has(a.id)) : auds.slice(0, 1)
    st.audienceIds = chosen.map((a) => a.id)
    sayUser(`Targeting ${chosen.map((a) => a.name).join(', ')}`)
    presentFlowGoalOrWeeks()
  }
  const presentFlowGoalOrWeeks = () => {
    const st = flowBuildRef.current!
    const objs = flowObjectives()
    if (objs.length) {
      st.step = 2
      say(`What's the goal? Pick the objective this campaign should drive.`, { goalPick: objs.map((o) => ({ id: o.id, label: o.name, metric: o.metric })) })
    } else {
      askFlowWeeks()
    }
  }
  const askFlowWeeks = () => {
    const st = flowBuildRef.current!
    st.step = 3
    say(`Over how many weeks should "${st.name}" run? (a number, e.g. 4)`)
  }
  // Goal chosen by clicking a button during the flow-build: record it and move on to timing.
  const pickFlowGoal = (obj: { id: string; label: string } | null) => {
    const st = flowBuildRef.current
    if (!st || st.step !== 2) return
    setQ('')
    if (obj) { st.objectiveId = obj.id; sayUser(obj.label) } else { sayUser('Skip goal') }
    askFlowWeeks()
  }

  // ── Measure: after a flow is built, cover the two Measure sections (Reports + Insights). Recap what
  // gets tracked (the brand's objectives; draft them if none), then ask the reporting cadence.
  const startMeasure = async () => {
    setQ('')
    const brand = useTrafficStore.getState().clientFilter
    if (!brand || brand === 'all') { closeHomeChat(); setPage('reports'); return }
    // Objectives define what to measure. If none exist yet, draft them first (this also covers cadence).
    if (!useTrafficStore.getState().objectives.filter((o) => !o.brand || o.brand === brand).length) {
      await draftBrandObjectives()
    }
    const measured = useTrafficStore.getState().objectives.filter((o) => !o.brand || o.brand === brand)
    const metrics = [...new Set(measured.map((o) => o.metric?.trim()).filter(Boolean))] as string[]
    const measureBit = metrics.length ? `You'll track ${metrics.slice(0, 4).join(', ')}. ` : ''
    say(`${measureBit}How often do you want to report on **${brand}**?`, { cadencePick: true })
  }
  // Reporting cadence chosen: generate a baseline report so Reports/Insights have a starting line.
  const pickCadence = async (cadence: string) => {
    setQ('')
    sayUser(cadence)
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'assets', label: `Setting up ${brand}'s measurement` }] }])
    await new Promise((r) => setTimeout(r, 400))
    const scopedRows = store.rows.filter((r) => rowInScope(r, { filter: 'all', query: '', clientFilter: brand, campaignFilter: 'all' }))
    const { title, kind, summary, html } = buildBrandReport({ brand, rows: scopedRows, audiences: store.clientAudiences[brand] ?? [] })
    const reportId = addReport({ client: brand, title, kind, summary, html })
    setMessages((m) =>
      m.map((x) => (x.id === id ? { ...x, busy: false, steps: undefined, text: `Set. You'll report **${cadence.toLowerCase()}**, and I saved a baseline report, **${title}**, to ${brand}'s Reports so you have a starting line. Watch Insights as the assets go live.`, reportId, reportBrand: brand, measureDone: true } : x)),
    )
    lastActionRef.current = 'measure'
  }
  const buildFlowFromChat = async (name: string, weeks: number, objectiveId?: string, audienceIds?: string[]) => {
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    // Scope the flow to the audiences picked for it (the flow-build's audience step wins); else the
    // ones you're pursuing from go-to-market; else all.
    const allAud = store.clientAudiences[brand] ?? []
    const pursued = gtmPursuedRef.current
    const audiences =
      audienceIds && audienceIds.length
        ? allAud.filter((a) => audienceIds.includes(a.id))
        : pursued && pursued.size
          ? allAud.filter((a) => pursued.has(a.id))
          : allAud
    const audienceNames = audiences.map((a) => a.name)
    // Channels from the brand's audiences; fall back to a sensible content mix if none are set yet.
    const channelIds = [...new Set(audiences.flatMap((a) => a.channels ?? []))]
    let presets = channelIds
      .map((cid) => DELIVERABLE_PRESETS.find((p) => p.channel === cid))
      .filter((p): p is NonNullable<typeof p> => !!p)
    if (!presets.length) presets = ['blog', 'newsletter', 'li-text'].map((k) => presetByKey(k)).filter((p): p is NonNullable<typeof p> => !!p)
    const deliverables: Deliverable[] = presets.map((p) => ({ label: p.label, channel: p.channel, assetType: p.assetType, media: p.media, perMonth: p.perMonth, runtime: p.runtime, brand: p.brand }))
    const campaignName = `${brand} — ${name}`
    // The brand's records to hang on the flow: audiences (segment tags) + proof points (proof tags),
    // plus its primary objective as the campaign goal. Mirrors what the visual builder links.
    const proof = store.brandSystems[brand]?.rtbs ?? []
    const refs: FlowReference[] = [
      ...audiences.map((a) => ({ type: 'segment' as const, id: a.id, label: a.name })),
      ...proof.map((r) => ({ type: 'proof' as const, id: r.id, label: r.label })),
    ]
    // The goal picked in the conversation wins; fall back to the brand's first objective.
    const brandObjectives = store.objectives.filter((o) => !o.brand || o.brand === brand)
    const objective = (objectiveId && brandObjectives.find((o) => o.id === objectiveId)) || brandObjectives[0]
    const goalTarget = objective?.target ? Number(String(objective.target).replace(/[^0-9.]/g, '')) || undefined : undefined
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'assets', label: `Building ${name}` }] }])
    addCampaign({ name: campaignName, client: brand, strategy: 'content-seo', subject: name, durationWeeks: weeks, objective: objective?.name, goalKpi: objective?.metric?.trim() || undefined, goalTarget })
    if (refs.length) setCampaignReferences(campaignName, refs)
    // Seed the assets, then write copy for the freshly-created rows (diff to find them, like the builder).
    const beforeIds = new Set(useTrafficStore.getState().rows.map((r) => r.id))
    await seedCampaignAssets(campaignName, deliverables, { flightWeeks: weeks, audiences: audienceNames })
    const newIds = useTrafficStore.getState().rows.filter((r) => r.campaign === campaignName && !beforeIds.has(r.id)).map((r) => r.id)
    let wroteCopy = false
    if (newIds.length) {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, steps: [{ kind: 'assets', label: `Writing copy for ${newIds.length} asset${newIds.length === 1 ? '' : 's'}` }] } : x)))
      try {
        await draftCopy(newIds)
        wroteCopy = true
      } catch {
        /* leave assets as drafts if copy generation fails */
      }
    }
    const chLabels = [...new Set(deliverables.map((d) => CHANNELS[d.channel]?.label ?? d.channel))]
    // Report what got linked to the flow: audiences, proof points, and the objective.
    const linked: string[] = []
    if (audienceNames.length) linked.push(`your ${audienceNames.length} audience${audienceNames.length === 1 ? '' : 's'}`)
    if (proof.length) linked.push(`${proof.length} proof point${proof.length === 1 ? '' : 's'}`)
    if (objective) linked.push(`the "${objective.name}" objective`)
    const linkBit = linked.length ? `, with ${linked.join(', ')} attached` : ''
    setMessages((m) =>
      m.map((x) => (x.id === id ? { ...x, busy: false, steps: undefined, text: `I built **${name}** for ${brand}, ${newIds.length} asset${newIds.length === 1 ? '' : 's'} across ${chLabels.join(', ')} over ${weeks} weeks${linkBit}${wroteCopy ? ', with copy written for each' : ''}. Open it to review.`, flowBuiltName: campaignName } : x)),
    )
    lastActionRef.current = 'flow'
    // Close the loop: set up how you'll measure this, what to track and how often to report.
    say(`Last piece: how you'll measure **${name}**, what to track and how often to report. Want to set that up?`, { measureOffer: true })
  }

  const run = async (question: string) => {
    const text = question.trim()
    if (!text || busyRef.current) return

    // Guided setup is a deterministic script that creates records as we go — handle it before the
    // read-only ask/report paths so a task request never dead-ends.
    if (setupRef.current) return handleSetupAnswer(text)
    // Guided "build a flow" conversation takes the next answers.
    if (flowBuildRef.current) return void handleFlowAnswer(text)

    // If we asked for the brand's website (to ingest content), the next message is the URL.
    if (awaitingSiteRef.current) {
      awaitingSiteRef.current = false
      sayUser(text); setQ(''); void ingestBrandContent(text); return
    }
    // "Ingest / import / pull in my content" -> pull the brand's site content into the Library.
    if (/\b(ingest|import|pull in|bring in|scrape|crawl)\b/i.test(text) && /\b(content|site|website|pages?|library|blog|posts?)\b/i.test(text)) {
      sayUser(text); setQ(''); void ingestBrandContent(); return
    }

    // "Build my foundation" launches the guided, section-by-section flow.
    if (/\bbuild\b.*\b(foundation|everything|it all|the rest|out my brand)\b/i.test(text)) {
      sayUser(text); startFoundationFlow(); return
    }
    // "Build my go-to-market" launches the GTM sequence (channels + objectives).
    if (/\b(build|set ?up|do)\b.*\b(go[ -]?to[ -]?market|gtm)\b/i.test(text)) {
      sayUser(text); startGtmFlow(); return
    }
    // "Build/make/draft a flow (or campaign)" launches the guided flow-build conversation.
    if (/\b(build|make|create|draft|start|new|set up)\b.*\b(flow|campaign)\b/i.test(text)) {
      sayUser(text); startFlowBuild(); return
    }

    // Take real action for "do" requests instead of falling through to the read-only ask engine.
    const doVerb = /\b(draft|add|create|generate|write|give|need|make|build|develop|define|more|another|additional)\b/i.test(text)
    const wantsProof = /\bproof\s?points?\b|\brtbs?\b|\breasons?\s+to\s+believe\b/i.test(text) && doVerb
    const wantsAudience = /\baudiences?\b|\bpersonas?\b|\bsegments?\b/i.test(text) && doVerb
    const wantsMessage = /\bmessages?\b|\bangles?\b/i.test(text) && doVerb
    const wantsVoice = /\bvoices?\b|\btone[ -]?of[ -]?voice\b/i.test(text) && doVerb
    const wantsObjective = /\bobjectives?\b|\bgoals?\b|\bkpis?\b/i.test(text) && doVerb
    const wantsChannel = /\bchannels?\b/i.test(text) && doVerb
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
    if (wantsObjective || (bareMore && lastActionRef.current === 'objective')) {
      sayUser(text); setQ(''); void draftBrandObjectives(); return
    }
    if (wantsChannel || (bareMore && lastActionRef.current === 'channel')) {
      sayUser(text); setQ(''); void setBrandChannels(); return
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
      objectiveDone: m.objectiveDone,
      channelDone: m.channelDone,
      flowStep: m.flowStep,
      goalPick: m.goalPick,
      audiencePick: m.audiencePick,
      ingestDone: m.ingestDone,
      gtmOffer: m.gtmOffer,
      flowOffer: m.flowOffer,
      flowBuiltName: m.flowBuiltName,
      measureOffer: m.measureOffer,
      cadencePick: m.cadencePick,
      measureDone: m.measureDone,
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
                      <button className="hchat-setup-btn" onClick={startFoundationFlow}>Build my foundation</button>
                      <button className="hchat-setup-btn" onClick={addAudiences}>Add audiences</button>
                      <button className="hchat-setup-btn" onClick={draftBrandMessages}>Draft messages</button>
                      <button className="hchat-setup-btn" onClick={addBrandVoices}>Add voices</button>
                      <button className="hchat-setup-btn" onClick={draftProofPoints}>Draft proof points</button>
                      <button className="hchat-setup-btn" onClick={setBrandChannels}>Set channels</button>
                      <button className="hchat-setup-btn" onClick={draftBrandObjectives}>Draft objectives</button>
                      <button className="hchat-setup-btn" onClick={() => startFlowBuild()}>Draft a campaign</button>
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
                  {m.objectiveDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { closeHomeChat(); setPage('objectives') }}>View objectives</button>
                    </div>
                  )}
                  {m.channelDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { closeHomeChat(); setPage('channelrecords') }}>View channels</button>
                    </div>
                  )}
                  {m.ingestDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { closeHomeChat(); setPage('content') }}>View Library</button>
                    </div>
                  )}
                  {m.gtmOffer && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => startGtmFlow()}>Build go-to-market</button>
                      <button className="hchat-setup-btn ghost" onClick={() => say(`No problem. Say "build my go-to-market" whenever you're ready.`)}>Not now</button>
                    </div>
                  )}
                  {m.flowOffer && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => startFlowBuild()}>Build a campaign</button>
                      <button className="hchat-setup-btn ghost" onClick={() => say(`No problem. Say "build a campaign" whenever you're ready.`)}>Not now</button>
                    </div>
                  )}
                  {m.flowBuiltName && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { const n = m.flowBuiltName!; closeHomeChat(); openFlow(n, 'flow') }}>Open campaign</button>
                    </div>
                  )}
                  {m.flowStep && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => void onFlowStep(m.id, m.flowStep as FlowStep, true)}>{FLOW_PROMPT[m.flowStep as FlowStep].label}</button>
                      <button className="hchat-setup-btn ghost" onClick={() => void onFlowStep(m.id, m.flowStep as FlowStep, false)}>Skip</button>
                    </div>
                  )}
                  {m.goalPick && (
                    <div className="hchat-setup-actions">
                      {m.goalPick.map((g) => (
                        <button key={g.id} className="hchat-setup-btn" title={g.metric || undefined} onClick={() => pickFlowGoal(g)}>{g.label}</button>
                      ))}
                      <button className="hchat-setup-btn ghost" onClick={() => pickFlowGoal(null)}>Skip</button>
                    </div>
                  )}
                  {m.audiencePick && (
                    <div className="hchat-setup-actions">
                      {m.audiencePick.map((a) => {
                        const on = gtmAudSel.has(a.id)
                        return (
                          <button key={a.id} className={`hchat-setup-btn${on ? '' : ' ghost'}`} onClick={() => toggleGtmAud(a.id)}>{on ? '✓ ' : ''}{a.label}</button>
                        )
                      })}
                      <button className="hchat-setup-btn" onClick={() => (flowBuildRef.current ? confirmFlowAudiences() : confirmGtmAudiences())}>Continue</button>
                    </div>
                  )}
                  {m.measureOffer && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => void startMeasure()}>Set up measurement</button>
                      <button className="hchat-setup-btn ghost" onClick={() => say(`No problem. Open Reports or Insights whenever you want to measure.`)}>Not now</button>
                    </div>
                  )}
                  {m.cadencePick && (
                    <div className="hchat-setup-actions">
                      {['Weekly', 'Monthly', 'Quarterly'].map((c) => (
                        <button key={c} className="hchat-setup-btn" onClick={() => void pickCadence(c)}>{c}</button>
                      ))}
                    </div>
                  )}
                  {m.measureDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { closeHomeChat(); setLibraryMode('data') }}>View Insights</button>
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
              <button className="hchat-action" disabled={busy} onClick={() => startFoundationFlow()}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 8l10 5 10-5-10-5Z" /><path d="m2 13 10 5 10-5" /></svg>
                Build foundation
              </button>
              <button className="hchat-action" disabled={busy} onClick={() => startGtmFlow()}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Z" /><path d="M17.5 9a3 3 0 0 1 0 6" /></svg>
                Build go-to-market
              </button>
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
              <button className="hchat-action" disabled={busy} onClick={() => void setBrandChannels()}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.3" /><circle cx="18" cy="6" r="2.3" /><circle cx="12" cy="18" r="2.3" /><path d="M6 8.3v2.2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8.3M12 12.5v3.2" /></svg>
                Set channels
              </button>
              <button className="hchat-action" disabled={busy} onClick={() => void draftBrandObjectives()}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></svg>
                Draft objectives
              </button>
              <button className="hchat-action" disabled={busy} onClick={() => void ingestBrandContent()}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13l4-3h5" /><path d="M17 14v6M14 17h6" /></svg>
                Ingest content
              </button>
              <button className="hchat-action" disabled={busy} onClick={() => startFlowBuild()}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
                Draft a campaign
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
