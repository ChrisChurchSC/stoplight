import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { askClaude } from '../adapters/ask/claudeAsk'
import { draftProof } from '../adapters/ask/draftProof'
import { clientForCampaign } from '../domain/clients'
import type { TrafficRow } from '../domain/types'
import { getActiveWorkspaceId } from '../lib/session'
import { draftAudiences, type DraftOrigin } from '../adapters/ask/draftAudiences'
import { draftMessages } from '../adapters/ask/draftMessages'
import { draftVoices } from '../adapters/ask/draftVoices'
import { brandDifferentiatorText } from '../domain/brandRecord'
import { draftObjectives } from '../adapters/ask/draftObjectives'
import { draftChannels } from '../adapters/ask/draftChannels'
import { draftAngle } from '../adapters/ask/draftAngle'
import { FUNNEL_STAGES } from '../domain/funnel'
import { readAggregatePatterns } from '../adapters/aggregate/aggregateOutcomes'
import { ingestSite } from '../adapters/ask/ingestSite'
import { CHANNEL_LIST, resolveChannelId } from '../domain/channels'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { buildAskContext } from '../domain/askClaude'
import { buildBrandReport } from '../domain/reportGen'
import { freshRecordId } from '../domain/records'
import { newAudience } from '../domain/audiences'
import type { Message } from '../domain/message'
import { buildAskBrand } from '../lib/askBrand'
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

/**
 * When `embedded`, this chat is running inside another surface that owns the screen (today: the
 * first-run onboarding sequence). Two things change: it takes its opening seed from the prop rather
 * than the global `homeChatSeed`, and it never closes itself or navigates the app away. Both matter
 * because the app-global path (`openHomeChat`) also sets `page:'portfolio'`, which mounts a SECOND
 * HomeChat in Portfolio behind the overlay, and any of the ~19 "go look at X" exits would tear the
 * onboarding surface down mid-setup.
 */
export function HomeChat({ embedded = false, seed, onExit }: { embedded?: boolean; seed?: string; onExit?: () => void } = {}) {
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
  // Which of the foundation passes were really written by the model, and which fell back to a
  // canned generic set. Every adapter swallows its failures, so without this the review screen
  // would present "Team leads / Operations owners / Executive sponsors" as a finding about the
  // user's business. Reset at the start of each build.
  const originsRef = useRef<Partial<Record<'strategy' | 'audiences' | 'voices' | 'proof' | 'ctas' | 'messages', DraftOrigin>>>({})
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const addMessage = useTrafficStore((s) => s.addMessage)
  const addVoice = useTrafficStore((s) => s.addVoice)
  const addObjective = useTrafficStore((s) => s.addObjective)
  const importAssets = useTrafficStore((s) => s.importAssets)
  const addLibraryItem = useTrafficStore((s) => s.addLibraryItem)
  const setMessagingBrand = useTrafficStore((s) => s.setMessagingBrand)
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
  // The last thing the chat DID (e.g. 'proof'), so a follow-up like "more" continues that action.
  const lastActionRef = useRef<string | null>(null)
  // When we've asked for the brand's website (to ingest content), the next message is read as the URL.
  const awaitingSiteRef = useRef(false)

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

  // Draft proof points for the active brand, grounded in the FULL brand context (its description on
  // the brand record + profile + audiences), add them to the brand's library, and report them in the
  // chat. Passes the existing proof points so repeat calls ("more") produce new, distinct ones.
  // Falls back to a small heuristic set when the AI isn't available.
  // The brand's REAL published work (copy + measured reach), highest-reach first, so voice and proof
  // points are derived from what the brand actually wrote and how it performed, not just a one-liner.
  const brandLibrarySamples = (brand: string, limit = 12): { text: string; channel?: string; reach?: number }[] => {
    const rows = useTrafficStore.getState().rows
    const isLib = (r: TrafficRow) => r.status === 'posted' || !!r.postedAt || (!!r.sourceUrl && r.source !== 'generated')
    const belongs = (r: TrafficRow) => (r.client || '').trim() === brand || clientForCampaign((r.campaign || '').trim()) === brand
    const reachOf = (r: TrafficRow): number => {
      const m = r.socialMetrics ?? {}
      return Number(m.impressions || m.reach || m.views || m.opens || 0) || 0
    }
    return rows
      .filter((r) => isLib(r) && belongs(r))
      .map((r) => ({ r, reach: reachOf(r) }))
      .sort((a, b) => b.reach - a.reach)
      .slice(0, limit)
      .map(({ r, reach }) => ({
        text: [r.assetName, r.body, ...Object.values(r.messaging ?? {})]
          .filter(Boolean)
          .join(' | ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 400),
        channel: r.channel,
        reach: reach || undefined,
      }))
      .filter((x) => x.text.length > 12)
  }

  const draftProofPoints = async () => {
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    if (!brand || brand === 'all') { exitToPage('proofpoints'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { oneLiner?: string; industry?: string }
    // The rich brand context (positioning, differentiator, objective, …) lives on the brand record.
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const audiences = (store.clientAudiences[brand] ?? []).map((a) => a.name)
    setMessagingBrand(brand)
    const existing = (useTrafficStore.getState().library.rtbs ?? []).map((r) => r.label).filter(Boolean)
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'records', label: `Drafting proof points for ${brand}` }] }])
    const proofRes = await draftProof({
      brand,
      oneLiner: profile.oneLiner,
      industry: profile.industry || rec.industry,
      positioning: rec.positioning,
      descriptor: rec.descriptor,
      keyMessage: rec.keyMessage,
      differentiator: brandDifferentiatorText(rec),
      businessObjective: rec.businessObjective,
      audiences,
      existing,
      samples: brandLibrarySamples(brand),
    })
    const proof = proofRes.items
    originsRef.current.proof = proofRes.origin
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
    if (!brand || brand === 'all') { exitToPage('segments'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { oneLiner?: string; industry?: string }
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const current = store.clientAudiences[brand] ?? []
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'segments', label: `Building audiences for ${brand}` }] }])
    const draftedRes = await draftAudiences({
      brand,
      oneLiner: profile.oneLiner,
      positioning: rec.positioning,
      descriptor: rec.descriptor,
      differentiator: brandDifferentiatorText(rec),
      businessObjective: rec.businessObjective,
      industry: profile.industry || rec.industry,
      existing: current.map((a) => a.name),
      samples: brandLibrarySamples(brand),
    })
    const drafted = draftedRes.items
    originsRef.current.audiences = draftedRes.origin
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
    if (!brand || brand === 'all') { exitToPage('messages'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { oneLiner?: string; industry?: string }
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const audiences = (store.clientAudiences[brand] ?? []).map((a) => a.name)
    const existing = store.messages.filter((m) => !m.brand || m.brand === brand).map((m) => m.name)
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'records', label: `Drafting messages for ${brand}` }] }])
    const draftedRes = await draftMessages({ brand, oneLiner: profile.oneLiner, positioning: rec.positioning, descriptor: rec.descriptor, differentiator: brandDifferentiatorText(rec), businessObjective: rec.businessObjective, industry: profile.industry || rec.industry, audiences, existing, samples: brandLibrarySamples(brand) })
    const drafted = draftedRes.items
    originsRef.current.messages = draftedRes.origin
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
    if (!brand || brand === 'all') { exitToPage('voices'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { oneLiner?: string; industry?: string }
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const existing = store.voices.filter((v) => !v.brand || v.brand === brand).map((v) => v.name)
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'records', label: `Defining voice for ${brand}` }] }])
    const draftedRes = await draftVoices({ brand, oneLiner: profile.oneLiner, positioning: rec.positioning, descriptor: rec.descriptor, differentiator: brandDifferentiatorText(rec), businessObjective: rec.businessObjective, industry: profile.industry || rec.industry, existing, samples: brandLibrarySamples(brand) })
    const drafted = draftedRes.items
    originsRef.current.voices = draftedRes.origin
    drafted.forEach((d) => addVoice({ brand, name: d.name, summary: d.summary, tone: d.tone, dos: d.dos, donts: d.donts, sample: d.sample, useFor: d.useFor, status: 'draft' }))
    // 'draft', not 'active': these are invented by a model from a one-line description and nobody
    // has read them yet. Stamping them active made the machine's guess the live voice that copy
    // generation reads, before the user had seen a single word of it.
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
    if (!brand || brand === 'all') { exitToPage('objectives'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { oneLiner?: string; industry?: string }
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const existing = store.objectives.filter((o) => !o.brand || o.brand === brand).map((o) => o.name)
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'records', label: `Drafting objectives for ${brand}` }] }])
    // Anchor targets to the brand's real baselines when analytics are connected.
    const perf = (store.brandActuals[brand]?.channels ?? []).map((c) => ({ label: c.label, reach: c.reach, reachUnit: c.reachUnit, engagement: c.engagement }))
    const { objectives: drafted, reportingCadence } = await draftObjectives({ brand, oneLiner: profile.oneLiner, positioning: rec.positioning, differentiator: brandDifferentiatorText(rec), businessObjective: rec.businessObjective, industry: profile.industry || rec.industry, existing, performance: perf.length ? perf : undefined })
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
    if (!brand || brand === 'all') { exitToPage('channelrecords'); return }
    const profile = (store.clientProfiles[brand] ?? {}) as { oneLiner?: string; industry?: string }
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const allAud = store.clientAudiences[brand] ?? []
    const audiences = allAud
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'segments', label: `Choosing channels for ${brand}` }] }])
    // Feed the brand's live traffic mix (connected analytics) so channel picks weight toward what works.
    const perf = (store.brandActuals[brand]?.channels ?? []).map((c) => ({ label: c.label, reach: c.reach, reachUnit: c.reachUnit, engagement: c.engagement }))
    // Cross-customer learning: channels proven for similar personas, floor-gated + anonymized. Empty
    // until the pool clears the floor, so this is a no-op until enough customers have contributed.
    const pooled = await readAggregatePatterns().catch(() => [])
    const patterns = pooled
      .filter((p) => p.dimension === 'channel')
      .map((p) => ({ attribute: p.attribute, archetype: p.archetype, customers: p.customers, outcomePerVariant: p.variants ? p.outcome / p.variants : p.outcome }))
      .sort((a, b) => b.outcomePerVariant - a.outcomePerVariant)
      .slice(0, 8)
    const recs = await draftChannels({ brand, oneLiner: profile.oneLiner, positioning: rec.positioning, businessObjective: rec.businessObjective, industry: profile.industry || rec.industry, audiences: audiences.map((a) => a.name), channelOptions: CHANNEL_LIST.map((c) => c.label), performance: perf.length ? perf : undefined, patterns: patterns.length ? patterns : undefined })
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

  // Recommend the interpretive fields (message angle, funnel stage, conversion outcome) for the
  // brand's audiences, FILL-WHEN-EMPTY so it back-fills without clobbering anything the user wrote.
  const recommendAngles = async () => {
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    if (!brand || brand === 'all') { exitToPage('segments'); return }
    const audiences = store.clientAudiences[brand] ?? []
    if (!audiences.length) { say('Add audiences first and I can recommend an angle, funnel stage, and outcome for each.'); return }
    const rec = (store.brandRecords.find((b) => b.name === brand) ?? {}) as { businessObjective?: string; positioning?: string; industry?: string }
    const id = nid()
    setMessages((m) => [...m, { id, role: 'assistant', busy: true, steps: [{ kind: 'segments', label: `Recommending angles for ${brand}'s audiences` }] }])
    const drafted = await draftAngle({
      brand,
      businessObjective: rec.businessObjective,
      positioning: rec.positioning,
      industry: rec.industry,
      audiences: audiences.map((a) => ({
        name: a.name,
        role: a.role,
        definition: a.definition,
        pains: a.pains,
        goalTags: a.goalTags,
        triggers: a.triggers,
        demographics: [a.ageRanges?.join('/'), a.incomeRanges?.join('/'), a.gender, (a.geos ?? []).join('/')].filter(Boolean).join(', ') || undefined,
      })),
    })
    const stageLabel = (key: string) => FUNNEL_STAGES.find((s) => s.stage === key)?.label ?? key
    const byName = new Map(drafted.map((d) => [d.audience, d]))
    // Re-read the LIVE array (not the pre-await snapshot) so edits/additions made to this brand's
    // audiences during the AI call aren't clobbered by the stale list — mirrors SegmentsView.
    const live = useTrafficStore.getState().clientAudiences[brand] ?? []
    setClientAudiences(
      brand,
      live.map((a) => {
        const d = byName.get(a.name)
        if (!d) return a
        return {
          ...a,
          messageAngle: a.messageAngle.trim() ? a.messageAngle : d.messageAngle,
          funnelStage: a.funnelStage?.trim() ? a.funnelStage : stageLabel(d.funnelStage),
          outcome: a.outcome?.trim() ? a.outcome : d.outcome,
        }
      }),
    )
    const summary = drafted.map((d) => `- **${d.audience}** (${stageLabel(d.funnelStage)} · ${d.outcome}): ${d.rationale}`).join('\n')
    setMessages((m) =>
      m.map((x) => (x.id === id ? { ...x, busy: false, steps: undefined, text: `Here's a recommended angle for each of **${brand}**'s audiences, filled where they were empty:\n\n${summary}` } : x)),
    )
    lastActionRef.current = 'angle'
  }

  // Ingest the brand's real published content (its website pages) into the Library. Needs the brand's
  // website; if it's not on file, ask for it (the next message is read as the URL). Uses a plain-fetch
  // server endpoint (works in production), then importAssets files the pages as Library content.
  const ingestBrandContent = async (urlOverride?: string) => {
    const store = useTrafficStore.getState()
    const brand = store.clientFilter
    if (!brand || brand === 'all') { exitToPage('content'); return }
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
    const items = await ingestSite(website, { brand, workspace: (await getActiveWorkspaceId()) || undefined })
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

  const run = async (question: string) => {
    const text = question.trim()
    if (!text || busyRef.current) return

    // If we asked for the brand's website (to ingest content), the next message is the URL.
    if (awaitingSiteRef.current) {
      awaitingSiteRef.current = false
      sayUser(text); setQ(''); void ingestBrandContent(text); return
    }
    // "Ingest / import / pull in my content" -> pull the brand's site content into the Library.
    if (/\b(ingest|import|pull in|bring in|scrape|crawl)\b/i.test(text) && /\b(content|site|website|pages?|library|blog|posts?)\b/i.test(text)) {
      sayUser(text); setQ(''); void ingestBrandContent(); return
    }

    // Take real action for "do" requests instead of falling through to the read-only ask engine.
    const doVerb = /\b(draft|add|create|generate|write|give|need|make|build|develop|define|more|another|additional)\b/i.test(text)
    const wantsProof = /\bproof\s?points?\b|\brtbs?\b|\breasons?\s+to\s+believe\b/i.test(text) && doVerb
    const wantsAudience = /\baudiences?\b|\bpersonas?\b|\bsegments?\b/i.test(text) && doVerb
    const wantsMessage = /\bmessages?\b|\bangles?\b/i.test(text) && doVerb
    const wantsVoice = /\bvoices?\b|\btone[ -]?of[ -]?voice\b/i.test(text) && doVerb
    const wantsObjective = /\bobjectives?\b|\bgoals?\b|\bkpis?\b/i.test(text) && doVerb
    const wantsChannel = /\bchannels?\b/i.test(text) && doVerb
    // More specific than wantsMessage (which also matches "angle"): recommend the audience angle +
    // funnel + outcome. Checked first so it wins over the brand-message and audience routes.
    const wantsAngleRec =
      /\b(recommend|suggest|propose|fill\s*in)\b.*\b(angles?|funnel|positioning|outcomes?)\b/i.test(text) ||
      (/\bangles?\b/i.test(text) && /\baudiences?\b/i.test(text) && doVerb)
    const bareMore = text.length <= 40 && /\b(more|another|additional|others?|keep going|again|continue)\b/i.test(text)
    if (wantsAngleRec || (bareMore && lastActionRef.current === 'angle')) {
      sayUser(text); setQ(''); void recommendAngles(); return
    }
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
          m.map((x) => (x.id === asstId ? { ...x, busy: false, steps: undefined, text: `You don't have any brands set up yet. Add a brand from the Brands page, then ask me again.` } : x)),
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

  // Leaving the chat for another page. Inert while embedded: the host surface owns navigation, and
  // closing here would end onboarding as a side effect of asking to look at something.
  const exitToPage = (p: Parameters<typeof setPage>[0]) => {
    if (embedded) return
    closeHomeChat()
    setPage(p)
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
    // Embedded takes its seed from the prop: the global one is consumed by whichever instance mounts
    // first, and it is nulled on use, so a second instance would either double-run it or lose it.
    const openWith = embedded ? seed : homeChatSeed
    if (openWith && seededRef.current !== openWith) {
      seededRef.current = openWith
      void run(openWith)
      if (!embedded) useTrafficStore.setState({ homeChatSeed: null })
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
      proofDone: m.proofDone,
      audienceDone: m.audienceDone,
      messageDone: m.messageDone,
      voiceDone: m.voiceDone,
      objectiveDone: m.objectiveDone,
      channelDone: m.channelDone,
      ingestDone: m.ingestDone,
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
        <button className="hchat-back" onClick={() => (embedded ? onExit?.() : closeHomeChat())}>
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
                        exitToPage('reports')
                      }}
                    >
                      View report →
                    </button>
                  )}
                  {m.proofDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { exitToPage('proofpoints') }}>View proof points</button>
                    </div>
                  )}
                  {m.audienceDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { exitToPage('segments') }}>View audiences</button>
                    </div>
                  )}
                  {m.messageDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { exitToPage('messages') }}>View messages</button>
                    </div>
                  )}
                  {m.voiceDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { exitToPage('voices') }}>View voices</button>
                    </div>
                  )}
                  {m.objectiveDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { exitToPage('objectives') }}>View objectives</button>
                    </div>
                  )}
                  {m.channelDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { exitToPage('channelrecords') }}>View channels</button>
                    </div>
                  )}
                  {m.ingestDone && (
                    <div className="hchat-setup-actions">
                      <button className="hchat-setup-btn" onClick={() => { exitToPage('content') }}>View Library</button>
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
          {clientFilter && clientFilter !== 'all' && (
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
            </>
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
