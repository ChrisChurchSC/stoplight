import { useTrafficStore } from '../store/useTrafficStore'
import { mapSite } from '../adapters/setup/siteMap'
import { newAudience } from '../domain/audiences'
import { newDescriptor } from '../domain/descriptors'
import { newLibraryCta } from '../domain/library'
import { clientForCampaign } from '../domain/clients'
import { funnelStageFor } from '../domain/funnel'
import { messagingFields } from '../domain/messaging'
import { detectBreaks } from '../domain/breaks'
import { rowInScope } from './scope'
import type { RowStatus, TrafficRow } from '../domain/types'
import { type AssetFilter, type ViewGroupBy, assetMatchesFilter, assetDate, groupKeyFor, resolveWindow } from '../domain/savedViews'
import { GTM_STRATEGIES, resolveStrategyKey } from '../domain/strategies'
import { conditionSentence } from '../domain/conditions'
import { STRATEGY_ASSETS } from '../domain/strategyAssets'

/**
 * Browser side of the agent bridge: this tab is the executor. It listens for
 * commands from the dev-server bridge (which the Hyperfocus MCP server, and so
 * Claude Desktop, posts to) and runs the REAL store actions, so a command typed
 * in Desktop adds a client / sets one up / runs a check in this tab, with the UI
 * updating live. Dev only. See server/agentBridge.ts and mcp/hyperfocus-server.mjs.
 */

type Args = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
// A list field — accepts an array of strings, or a comma/newline-separated string.
const list = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map((x) => str(x).trim()).filter(Boolean)
    : str(v)
      ? str(v)
          .split(/[\n,]/)
          .map((x) => x.trim())
          .filter(Boolean)
      : []

/** A row's messaging field keys by role, so semantic fields (headline / primaryText /
 *  description / cta) map onto the right keys for edit + author. */
function messagingKeys(channel: TrafficRow['channel'], assetType: string) {
  const fields = messagingFields(channel, assetType)
  return {
    headlineKey: fields.find((f) => /headline|subject|title|subhead/i.test(f.key))?.key,
    ctaKey: fields.find((f) => /cta/i.test(f.key))?.key,
    descKey: fields.find((f) => /desc|preview/i.test(f.key))?.key,
    primaryKey: (fields.find((f) => /primary|body|caption|intro|post|message/i.test(f.key)) ?? fields[0])?.key,
  }
}
/** Write the provided semantic copy fields into a messaging map (untouched fields stay). */
function applyCopyFields(channel: TrafficRow['channel'], assetType: string, base: Record<string, string>, a: Args): Record<string, string> {
  const k = messagingKeys(channel, assetType)
  const m = { ...base }
  if (typeof a.headline === 'string' && k.headlineKey) m[k.headlineKey] = a.headline
  if (typeof a.primaryText === 'string' && k.primaryKey) m[k.primaryKey] = a.primaryText
  if (typeof a.description === 'string' && k.descKey) m[k.descKey] = a.description
  if (typeof a.cta === 'string' && k.ctaKey) m[k.ctaKey] = a.cta
  return m
}
/** Resolve proofPoints (rtb ids OR labels) to rtb ids for a brand. */
function resolveProofIds(brand: string, proofPoints: string[]): string[] {
  const rtbs = useTrafficStore.getState().brandSystems[brand]?.rtbs ?? []
  const byId = new Set(rtbs.map((r) => r.id))
  const byLabel = new Map(rtbs.map((r) => [r.label.toLowerCase(), r.id]))
  return proofPoints.map((p) => (byId.has(p) ? p : byLabel.get(p.toLowerCase()) ?? p)).filter(Boolean)
}
const ASSET_STATUSES: RowStatus[] = ['draft', 'in_review', 'approved', 'rejected', 'scheduled', 'posted', 'failed']

const sourceAlias = (s: string) => (s === 'buffer' ? 'social-live' : s === 'site-map' ? 'site' : s)
/** A friendly window phrase → trailing days. "last week"/"7d"/"30"/"quarter" etc. */
function windowToDays(v: unknown): number | undefined {
  const s = str(v).trim().toLowerCase().replace(/^last\s+/, '').replace(/\s+/g, '')
  if (!s) return undefined
  const named: Record<string, number> = { today: 1, week: 7, fortnight: 14, month: 30, quarter: 90, halfyear: 182, year: 365 }
  if (named[s]) return named[s]
  const m = s.match(/^(\d+)(d|day|days|w|wk|week|weeks|m|mo|month|months|q|quarter|quarters|y|year|years)?$/)
  if (!m) return undefined
  const n = Number(m[1])
  const u = m[2] ?? 'd'
  if (/^w/.test(u)) return n * 7
  if (/^(mo|m)/.test(u) && u !== 'm') return n * 30
  if (u === 'm') return n * 30
  if (/^q/.test(u)) return n * 90
  if (/^y/.test(u)) return n * 365
  return n
}
/** Build an AssetFilter from bridge args (shared by query_assets / list_assets / canvases). */
function buildFilter(a: Args): AssetFilter {
  const arr = (v: unknown) => (list(v).length ? list(v) : undefined)
  const src = list(a.source).map(sourceAlias)
  const withinDays = Number(a.withinDays) > 0 ? Number(a.withinDays) : windowToDays(a.window)
  return {
    source: src.length ? src : undefined,
    campaign: str(a.campaign).trim() || undefined,
    channel: arr(a.channel),
    audience: arr(a.audience),
    stage: arr(a.stage),
    status: arr(a.status),
    publishedAfter: str(a.publishedAfter).trim() || undefined,
    publishedBefore: str(a.publishedBefore).trim() || undefined,
    withinDays,
    includeArchived: a.includeArchived === true,
  }
}
const rowEngagement = (r: TrafficRow) =>
  r.socialMetrics?.engagementRate ?? (r.engagement ? r.engagement.likes + r.engagement.comments : 0)
/** Sort rows by a saved-view / query sort key. */
function sortRows(rows: TrafficRow[], sort?: string): TrafficRow[] {
  const s = (sort ?? '').trim()
  if (!s) return rows
  const out = [...rows]
  if (s === 'newest') out.sort((a, b) => assetDate(b) - assetDate(a))
  else if (s === 'oldest') out.sort((a, b) => assetDate(a) - assetDate(b))
  else if (s === 'engagement') out.sort((a, b) => rowEngagement(b) - rowEngagement(a))
  else out.sort((a, b) => (b.socialMetrics?.[s] ?? 0) - (a.socialMetrics?.[s] ?? 0))
  return out
}
/** Map a row to the asset shape the connector returns (shared by list_assets + get_canvas). */
function assetView(r: TrafficRow, proofLabel: Map<string, string>, brandCtas: { label: string; stage?: string }[]) {
  const firstSentence = (s: string) => (s.split(/(?<=[.!?])\s+/)[0] ?? s).trim()
  const fields = messagingFields(r.channel, r.assetType)
  const headlineKey = fields.find((f) => /headline|subject|title|subhead/i.test(f.key))?.key
  const ctaKey = fields.find((f) => /cta/i.test(f.key))?.key
  const descKey = fields.find((f) => /desc|preview/i.test(f.key))?.key
  const primaryKey = (fields.find((f) => /primary|body|caption|intro|post|message/i.test(f.key)) ?? fields[0])?.key
  const m = r.messaging ?? {}
  const stage = funnelStageFor(r.channel, r.assetType)
  const primaryText = primaryKey ? (m[primaryKey] ?? '') : ''
  const headline = (headlineKey ? (m[headlineKey] ?? '') : '').trim() || firstSentence(primaryText)
  const stageCta = brandCtas.find((c) => c.stage === stage) ?? brandCtas[0]
  const cta = (ctaKey ? (m[ctaKey] ?? '') : '').trim() || stageCta?.label || ''
  const description = (descKey ? (m[descKey] ?? '') : '').trim() || firstSentence(primaryText)
  const proofIds = [...new Set(Object.values(r.rtbMap ?? {}).flat())]
  return {
    id: r.id,
    stage,
    audience: r.audience ?? '',
    channel: r.channel,
    type: r.assetType,
    format: r.format ?? '',
    status: r.status,
    source: r.source ?? 'generated',
    sourceUrl: r.sourceUrl ?? '',
    mediaRef: r.mediaRef ?? '',
    mediaRefs: r.mediaRefs ?? [],
    publishedAt: r.publishedAt ?? '',
    metrics: r.socialMetrics ?? null,
    metricsUpdatedAt: r.metricsUpdatedAt ?? null,
    engagement: rowEngagement(r),
    authored: !!r.authored,
    archived: !!r.archivedAt,
    headline,
    primaryText,
    description,
    cta,
    lineage: r.lineage ?? {},
    variantOf: r.variantOf ?? '',
    branchOf: r.branchOf ?? '',
    components: m,
    proofPoints: proofIds.map((id) => proofLabel.get(id) ?? id),
  }
}
/** Rows for a brand matching a filter, sorted, with limit/cursor paging. */
function resolveBrandAssets(brand: string, filter: AssetFilter, opts: { sort?: string; limit?: number; cursor?: number } = {}) {
  const st = useTrafficStore.getState()
  const proofLabel = new Map<string, string>()
  for (const rtb of st.brandSystems[brand]?.rtbs ?? []) proofLabel.set(rtb.id, rtb.label)
  const brandCtas = st.brandSystems[brand]?.ctas ?? []
  // Resolve any relative window (withinDays) to an absolute cutoff NOW, so a saved view
  // stays relative: "last 30 days" recomputes its start every time it's opened.
  const f = resolveWindow(filter, Date.now())
  const matched = sortRows(
    st.rows.filter((r) => clientForCampaign(r.campaign) === brand && assetMatchesFilter(r, f)),
    opts.sort,
  )
  const total = matched.length
  const cursor = Math.max(0, opts.cursor ?? 0)
  const page = opts.limit && opts.limit > 0 ? matched.slice(cursor, cursor + opts.limit) : matched.slice(cursor)
  const nextCursor = cursor + page.length < total ? cursor + page.length : null
  return { assets: page.map((r) => assetView(r, proofLabel, brandCtas)), total, nextCursor }
}

// Business model per GTM motion, so a strategy override refreshes the brand's
// businessModel to match (instead of leaving the inferred one stale).
const BUSINESS_MODEL_BY_MOTION: Record<string, string> = {
  plg: 'B2C / self-serve (product-led)',
  'demand-gen': 'B2B / SMB (demand capture)',
  'sales-led': 'B2B (sales-assisted)',
  abm: 'B2B (enterprise / named accounts)',
  community: 'B2C / audience-first',
  'content-seo': 'Content / organic',
  lifecycle: 'Subscription / recurring',
  outbound: 'B2B (outbound)',
}

// The whitelist of actions the bridge may run. Each maps to a real store action.
const handlers: Record<string, (a: Args) => Promise<unknown>> = {
  async listClients() {
    return { clients: useTrafficStore.getState().clientList }
  },

  async addClient(a) {
    const name = str(a.name).trim()
    if (!name) throw new Error('name is required')
    useTrafficStore.getState().addClient(name)
    return { added: name, clients: useTrafficStore.getState().clientList }
  },

  async setupClient(a) {
    const url = str(a.url).trim()
    if (!url) throw new Error('url is required')
    const store = useTrafficStore.getState()
    const setup = await store.generateSetup({ url, notes: str(a.notes) || undefined })
    await useTrafficStore.getState().provisionWorkspace(setup)
    return {
      client: setup.brand.name,
      website: setup.brand.website,
      industry: setup.brand.industry,
      voice: setup.brand.voice,
      businessModel: setup.businessModel ?? null,
      icp: setup.icp?.name,
      channels: setup.channelMix,
      // The inferred GTM motion, with its reasoning — visible at setup, stored on
      // the brand, pre-selected for generation, overridable via set_strategy.
      recommendedStrategy: setup.strategy,
      secondaryStrategy: setup.secondaryStrategy ?? null,
      strategyRationale: setup.strategyRationale ?? null,
      strategyConfidence: setup.strategyConfidence ?? null,
      signalsUsed: setup.signalsUsed ?? [],
      campaign: setup.campaign?.name,
      proofPoints: setup.rtbs?.length ?? 0,
    }
  },

  async mapClient(a) {
    const url = str(a.url).trim()
    if (!url) throw new Error('url is required')
    const map = await mapSite({ url, notes: str(a.notes) || undefined })
    await useTrafficStore.getState().provisionCurrentState(map)
    return {
      client: map.brand.name,
      audiences: map.audiences.map((x) => x.name),
      proofPoints: map.proofPoints.length,
      messages: map.messages.length,
      channels: [...new Set(map.messages.map((m) => m.channel))],
    }
  },

  async runCoherenceCheck(a) {
    const client = str(a.client).trim()
    const campaign = str(a.campaign).trim()
    const store = useTrafficStore.getState()
    if (client) store.setClientFilter(client)
    store.setCampaignFilter(campaign || 'all')
    await useTrafficStore.getState().runCoherenceCheck()
    const st = useTrafficStore.getState()
    const breaks = st.claudeBreaks ?? []
    // The deterministic, FIXABLE breaks (with stable ids + suggested fixes) for the
    // assets in scope — these are what apply_fix resolves. assetName resolves the row.
    const inScope = new Set(
      st.rows
        .filter((r) => rowInScope(r, { filter: 'all', query: '', clientFilter: st.clientFilter, campaignFilter: st.campaignFilter }))
        .map((r) => r.assetName),
    )
    // Fixable = the proof/cta/journey detectors PLUS structural breaks whose fix is a
    // real rewrite (e.g. casing). Structural breaks with after === before (duplicate,
    // claim, endorsement) are NOT one-click fixable — they need edit / reject / delete.
    const fromDetect = detectBreaks(st.rows).filter((b) => inScope.has(b.from.assetName))
    const fromStructural = (st.claudeBreaks ?? []).filter((b) => b.suggestedFix && b.suggestedFix.after && b.suggestedFix.after !== b.suggestedFix.before)
    const seen = new Set<string>()
    const fixable = [...fromDetect, ...fromStructural]
      .filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
      .map((b) => ({
        id: b.id,
        axis: b.axis,
        severity: b.severity,
        headline: b.headline,
        asset: b.from.assetName,
        field: b.suggestedFix.field,
        fix: { before: b.suggestedFix.before, after: b.suggestedFix.after, attachRtb: b.suggestedFix.attachRtb ?? null },
      }))
    return {
      client: st.clientFilter,
      campaign: campaign || 'All campaigns',
      live: st.coherenceLive,
      breakCount: breaks.length,
      // The full check result (incl. compliance/structural breaks — remediated by editing,
      // rejecting, or deleting the asset).
      breaks: breaks.map((b) => ({ axis: b.axis, severity: b.severity, headline: b.headline })),
      // The mechanically fixable subset — call apply_fix(breakId) on each.
      fixable,
    }
  },

  // ---- Set up a brand from your Claude ----

  // 1) Populate the brand's About info (profile).
  async setBrandInfo(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    const patch: Record<string, unknown> = {}
    for (const k of ['oneLiner', 'website', 'industry', 'mission', 'voice', 'founded', 'headquarters', 'traction']) {
      const v = str(a[k]).trim()
      if (v) patch[k] = v
    }
    for (const k of ['products', 'differentiators', 'values', 'locations']) {
      const l = list(a[k])
      if (l.length) patch[k] = l
    }
    // A strategy passed here is resolved to a valid motion key and overrides the
    // inferred one (same effect as set_strategy). Unknown values are a hard error.
    const stratIn = str(a.strategy).trim()
    if (stratIn) {
      const resolved = resolveStrategyKey(stratIn)
      if (!resolved) throw new Error(`unknown strategy "${stratIn}". Valid keys: ${GTM_STRATEGIES.map((s) => s.key).join(', ')}`)
      patch.strategy = resolved
    }
    store.setClientProfile(brand, patch)
    return { brand, set: Object.keys(patch) }
  },

  // Read the brand's active GTM motion + the reasoning behind it.
  async getStrategy(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    const p = useTrafficStore.getState().clientProfiles[brand] ?? {}
    const strat = p.strategy ? GTM_STRATEGIES.find((s) => s.key === p.strategy) : undefined
    return {
      brand,
      strategy: p.strategy ?? null,
      strategyName: strat?.name ?? null,
      secondaryStrategy: p.secondaryStrategy ?? null,
      rationale: p.strategyRationale ?? null,
      confidence: p.strategyConfidence ?? null,
      signalsUsed: p.strategySignals ?? [],
      businessModel: p.businessModel ?? null,
    }
  },

  // Override the brand's GTM motion. Persists and is honored by generate_assets.
  async setStrategy(a) {
    const brand = str(a.brand).trim()
    const input = str(a.strategy).trim()
    if (!brand || !input) throw new Error('brand and strategy are required')
    const key = resolveStrategyKey(input)
    if (!key) throw new Error(`unknown strategy "${input}". Valid keys: ${GTM_STRATEGIES.map((s) => s.key).join(', ')}`)
    const strat = GTM_STRATEGIES.find((s) => s.key === key)!
    const store = useTrafficStore.getState()
    store.addClient(brand)
    // A manual override replaces the inferred motion, so refresh businessModel to the
    // new motion's model (don't leave "B2B / SMB" after a flip to plg) and clear the
    // stale inferred signals. secondaryStrategy is set only if a fresh one is provided.
    const patch: Record<string, unknown> = {
      strategy: strat.key,
      strategyConfidence: 'high',
      strategyRationale: str(a.rationale).trim() || 'Set manually.',
      secondaryStrategy: resolveStrategyKey(str(a.secondaryStrategy)) || undefined,
      businessModel: BUSINESS_MODEL_BY_MOTION[strat.key] ?? undefined,
      strategySignals: undefined,
    }
    store.setClientProfile(brand, patch)
    return { brand, strategy: strat.key, strategyName: strat.name }
  },

  // 2) Pull a brand's LIVE assets/messaging from its site + ads (alias of mapClient).
  async pullLiveAssets(a) {
    return handlers.mapClient(a)
  },

  // 3) Write the messaging components into the brand's messaging system.
  async addAudience(a) {
    const brand = str(a.brand).trim()
    const name = str(a.name).trim()
    if (!brand || !name) throw new Error('brand and name are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    store.setMessagingBrand(brand)
    store.addLibraryItem(
      'audiences',
      newAudience({
        name,
        role: str(a.role),
        messageAngle: str(a.angle),
        pains: list(a.pains),
        descriptors: list(a.voice).map((label) => newDescriptor({ label })),
        approved: false,
      }),
    )
    return { brand, addedAudience: name }
  },

  async addProofPoint(a) {
    const brand = str(a.brand).trim()
    const claim = str(a.claim).trim()
    if (!brand || !claim) throw new Error('brand and claim are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    store.setMessagingBrand(brand)
    store.addLibraryItem('rtbs', {
      id: `lrtb_${Date.now().toString(36)}`,
      label: claim,
      detail: str(a.evidence),
      metric: str(a.metric) || undefined,
      source: str(a.source) || undefined,
      approved: false,
    })
    return { brand, addedProof: claim }
  },

  async addSubject(a) {
    const brand = str(a.brand).trim()
    const text = str(a.text).trim()
    if (!brand || !text) throw new Error('brand and text are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    store.setMessagingBrand(brand)
    store.addLibraryItem('subjects', {
      id: `subj_${Date.now().toString(36)}`,
      text,
      angle: str(a.angle) || undefined,
      outcome: str(a.outcome) || undefined,
      approved: false,
    })
    return { brand, addedSubject: text }
  },

  async addHook(a) {
    const brand = str(a.brand).trim()
    const text = str(a.text).trim()
    if (!brand || !text) throw new Error('brand and text are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    store.setMessagingBrand(brand)
    store.addLibraryItem('hooks', {
      id: `hook_${Date.now().toString(36)}`,
      text,
      kind: str(a.kind) || 'Pain',
      note: str(a.note) || undefined,
      approved: false,
    })
    return { brand, addedHook: text }
  },

  // Clear a brand's authored messaging (CTAs, proof, audiences, subjects, hooks) so
  // a polluted system can be rebuilt clean. Keeps the standard GTM strategies.
  async resetBrandMessaging(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    useTrafficStore.getState().resetBrandMessaging(brand)
    return { brand, reset: true }
  },

  async addCta(a) {
    const brand = str(a.brand).trim()
    const label = str(a.label).trim()
    if (!brand || !label) throw new Error('brand and label are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    store.setMessagingBrand(brand)
    store.addLibraryItem(
      'ctas',
      newLibraryCta({
        // No stage default: an untagged CTA is usable at ANY stage (helps distribution).
        // Defaulting to 'awareness' wrongly clustered untagged CTAs on one stage.
        label,
        stage: str(a.stage) || undefined,
        destination: str(a.destination) || undefined,
        outcome: str(a.outcome) || undefined,
        approved: false,
      }),
    )
    return { brand, addedCta: label }
  },

  async newCampaign(a) {
    const brand = str(a.brand).trim()
    const name = str(a.name).trim()
    if (!brand || !name) throw new Error('brand and name are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    store.addCampaign({ name, client: brand, strategy: str(a.strategy) || 'Current state' })
    return { brand, campaign: name }
  },

  // 4) Generate draft assets for a campaign from everything connected (strategy
  //    deliverables seeded, then copy drafted from the brand's profile/audiences/proof).
  async generateAssets(a) {
    const brand = str(a.brand).trim()
    const campaign = str(a.campaign).trim()
    if (!brand || !campaign) throw new Error('brand and campaign are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    // Strategy precedence: an EXPLICIT arg is resolved (key / name / alias) and, if
    // unrecognized, is a hard error — never a silent fall back to demand-gen. With no
    // arg, use the brand's stored (inferred/overridden) motion, then demand-gen.
    const rawStrategy = str(a.strategy).trim()
    let key: string
    if (rawStrategy) {
      const resolved = resolveStrategyKey(rawStrategy)
      if (!resolved) {
        throw new Error(
          `unknown strategy "${rawStrategy}". Valid keys: ${GTM_STRATEGIES.map((s) => s.key).join(', ')}`,
        )
      }
      key = resolved
    } else {
      const stored = store.clientProfiles[brand]?.strategy
      key = (stored && resolveStrategyKey(stored)) || 'demand-gen'
    }
    const strat = GTM_STRATEGIES.find((s) => s.key === key)
    const countFor = () => useTrafficStore.getState().rows.filter((r) => (r.campaign ?? '').trim() === campaign).length
    const before = countFor()
    if (before === 0 && !store.campaignList.some((c) => c.name === campaign)) {
      store.addCampaign({ name: campaign, client: brand, strategy: strat?.name ?? 'Demand Gen' })
    }
    const deliverables = STRATEGY_ASSETS[key] ?? STRATEGY_ASSETS['demand-gen']
    // Spread the brand's audiences across the seeded assets so each is written for
    // a specific segment. An optional `audiences` arg scopes the campaign to a
    // subset (e.g. a Captains-only campaign); omit it to span all of the brand's.
    const allAudiences = (useTrafficStore.getState().brandSystems[brand]?.audiences ?? []).map((x) => x.name)
    const wanted = list(a.audiences)
    const matched = wanted.length ? allAudiences.filter((n) => wanted.some((w) => w.toLowerCase() === n.toLowerCase())) : []
    const audiences = wanted.length ? (matched.length ? matched : wanted) : allAudiences
    await useTrafficStore.getState().seedCampaignAssets(campaign, deliverables, { audiences })
    // Scope to the campaign, then draft copy from the connected brand model.
    useTrafficStore.getState().setClientFilter(brand)
    useTrafficStore.getState().setCampaignFilter(campaign)
    await useTrafficStore.getState().draftCopy()
    // ABM: when accounts (or a target list) are given, fan the seeded set into per-account
    // 1:1 variants — each carries account lineage and reads to the account's real situation.
    const accountNames = list(a.accounts)
    let accountVariants = 0
    if (accountNames.length) {
      // Ensure a target list exists + is attached, so the account dimension resolves.
      const stp = useTrafficStore.getState()
      const existing = new Map((stp.accountsByBrand[brand] ?? []).map((x) => [x.name.toLowerCase(), x]))
      const ids = accountNames.map((n) => existing.get(n.toLowerCase())?.id ?? useTrafficStore.getState().addAccount(brand, { name: n }).id)
      if (!stp.campaignTargetList[campaign]) {
        const tl = useTrafficStore.getState().createTargetList(brand, `${campaign} targets`, ids)
        useTrafficStore.getState().attachTargetList(campaign, tl.id)
      }
      const res = await useTrafficStore.getState().fanOut(campaign, 'account', accountNames, { generate: true })
      accountVariants = res.variantCount
    }
    const after = countFor()
    // Echo the applied strategy KEY (so result.strategy === the requested key) plus
    // its display name and the deliverable count, which differs by motion.
    return {
      brand,
      campaign,
      strategy: key,
      strategyName: strat?.name ?? 'Demand Gen',
      audiences,
      accounts: accountNames,
      accountVariants,
      deliverableSet: deliverables.length,
      assetsGenerated: Math.max(0, after - before),
      totalAssets: after,
    }
  },

  // Read back / query a brand's assets, filtered server-side so only matches return
  // (small payloads). Filters: source, campaign, channel[], audience[], stage[], status[],
  // publishedAfter/Before, plus sort + limit/cursor paging.
  async listAssets(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    const { assets, total, nextCursor } = resolveBrandAssets(brand, buildFilter(a), {
      sort: str(a.sort).trim() || undefined,
      limit: Number(a.limit) || 0,
      cursor: Number(a.cursor) || 0,
    })
    return { brand, campaign: str(a.campaign).trim() || null, count: assets.length, total, nextCursor, assets }
  },

  // ---- Saved Views (smart canvases): named, re-resolving filtered boards of assets ----
  async createCanvas(a) {
    const brand = str(a.brand).trim()
    const name = str(a.name).trim()
    if (!brand || !name) throw new Error('brand and name are required')
    const layoutRaw = str(a.layout).trim()
    const groupRaw = str(a.groupBy).trim()
    const view = useTrafficStore.getState().createSavedView(brand, name, {
      // Normalize through buildFilter so a relative `window` ("last week"/"30d"/"quarter")
      // or `withinDays` is stored as withinDays and stays relative.
      filter: buildFilter((a.filter && typeof a.filter === 'object' ? a.filter : a) as Args),
      layout: (['board', 'calendar', 'grid', 'list'].includes(layoutRaw) ? layoutRaw : undefined) as never,
      groupBy: (['date', 'channel', 'audience', 'stage', 'none'].includes(groupRaw) ? groupRaw : undefined) as never,
      sort: str(a.sort).trim() || undefined,
    })
    return { id: view.id, brand, name: view.name, layout: view.layout, groupBy: view.groupBy, filter: view.filter }
  },

  // Open a canvas: re-resolve its filter NOW (live) and return the matched assets,
  // grouped + sorted per its config. New assets in-window appear; aged-out ones drop.
  async getCanvas(a) {
    const id = str(a.id).trim()
    if (!id) throw new Error('id is required')
    const view = useTrafficStore.getState().savedViews.find((v) => v.id === id)
    if (!view) throw new Error(`canvas not found: ${id}`)
    const { assets, total, nextCursor } = resolveBrandAssets(view.brand, view.filter, {
      sort: view.sort ?? 'newest',
      limit: Number(a.limit) || 0,
      cursor: Number(a.cursor) || 0,
    })
    // Group per the view config (board/calendar group; list/grid are flat).
    const gb = view.groupBy as ViewGroupBy
    const st = useTrafficStore.getState()
    const byId = new Map(st.rows.map((r) => [r.id, r]))
    let groups: { key: string; count: number; assetIds: string[] }[] | null = null
    if (gb && gb !== 'none') {
      const m = new Map<string, string[]>()
      for (const asset of assets) {
        const row = byId.get(asset.id)
        const k = row ? groupKeyFor(row, gb) : 'all'
        ;(m.get(k) ?? m.set(k, []).get(k)!).push(asset.id)
      }
      groups = [...m.entries()].map(([key, ids]) => ({ key, count: ids.length, assetIds: ids }))
      // Date groups newest-first; others alphabetical.
      groups.sort((x, y) => (gb === 'date' ? y.key.localeCompare(x.key) : x.key.localeCompare(y.key)))
    }
    return { id: view.id, brand: view.brand, name: view.name, layout: view.layout, groupBy: view.groupBy, sort: view.sort, filter: view.filter, count: assets.length, total, nextCursor, groups, assets }
  },

  async listCanvases(a) {
    const brand = str(a.brand).trim()
    const views = useTrafficStore.getState().savedViews.filter((v) => !brand || v.brand === brand)
    return {
      brand: brand || null,
      canvases: views.map((v) => ({ id: v.id, brand: v.brand, name: v.name, layout: v.layout, groupBy: v.groupBy, sort: v.sort, filter: v.filter })),
    }
  },

  async updateCanvas(a) {
    const id = str(a.id).trim()
    if (!id) throw new Error('id is required')
    const st = useTrafficStore.getState()
    if (!st.savedViews.some((v) => v.id === id)) throw new Error(`canvas not found: ${id}`)
    const patch: Record<string, unknown> = {}
    if (str(a.name).trim()) patch.name = str(a.name).trim()
    if (a.filter && typeof a.filter === 'object') patch.filter = buildFilter(a.filter as Args)
    const layoutRaw = str(a.layout).trim()
    if (['board', 'calendar', 'grid', 'list'].includes(layoutRaw)) patch.layout = layoutRaw
    const groupRaw = str(a.groupBy).trim()
    if (['date', 'channel', 'audience', 'stage', 'none'].includes(groupRaw)) patch.groupBy = groupRaw
    if (str(a.sort).trim()) patch.sort = str(a.sort).trim()
    st.updateSavedView(id, patch)
    return { id, updated: Object.keys(patch) }
  },

  async deleteCanvas(a) {
    const id = str(a.id).trim()
    if (!id) throw new Error('id is required')
    useTrafficStore.getState().deleteSavedView(id)
    return { id, deleted: true }
  },

  // ---- Asset lifecycle: edit / author / approve / delete ----

  // Edit an asset's copy / targeting. Editing changes the content, so the cached
  // coherence status invalidates (the next run reflects the edit).
  async editAsset(a) {
    const id = (str(a.assetId).trim() || str(a.id).trim())
    if (!id) throw new Error('assetId is required')
    const st = useTrafficStore.getState()
    const row = st.rows.find((r) => r.id === id)
    if (!row) throw new Error(`asset not found: ${id}`)
    const brand = clientForCampaign(row.campaign)
    const channel = (str(a.channel).trim() || row.channel) as TrafficRow['channel']
    const assetType = str(a.assetType).trim() || row.assetType || ''
    const patch: Partial<TrafficRow> = {}
    if (str(a.channel).trim()) patch.channel = channel
    if (str(a.assetType).trim()) patch.assetType = assetType
    if (typeof a.audience === 'string') patch.audience = str(a.audience).trim()
    if (str(a.format).trim()) patch.format = str(a.format).trim()
    const stage = str(a.stage).trim().toLowerCase()
    if (['awareness', 'consideration', 'conversion', 'retention'].includes(stage)) patch.funnelStage = stage as never
    if (['headline', 'primaryText', 'description', 'cta'].some((k) => typeof a[k] === 'string'))
      patch.messaging = applyCopyFields(channel, assetType, row.messaging ?? {}, a)
    const proofPoints = list(a.proofPoints)
    if (proofPoints.length) {
      const ids = resolveProofIds(brand, proofPoints)
      const pk = messagingKeys(channel, assetType).primaryKey ?? 'primary'
      patch.rtbMap = { ...(row.rtbMap ?? {}), [pk]: ids }
    }
    await useTrafficStore.getState().updateRow(id, patch)
    return { id, updated: Object.keys(patch), note: 'Re-run run_coherence_check to see the edit reflected.' }
  },

  // Apply a coherence check's suggested fix to the flagged asset (the repair payoff).
  // Handles both break systems: the proof/cta/journey detectors (via applyBreakFix) and
  // the structural detectors (casing/leak) whose fix is a real rewrite. Breaks with no
  // mechanical fix (duplicate, claim, endorsement) are remediated by edit / reject / delete.
  async applyFix(a) {
    const breakId = str(a.breakId).trim() || str(a.id).trim()
    if (!breakId) throw new Error('breakId is required')
    const snapshot = () => JSON.stringify(useTrafficStore.getState().rows.map((r) => [r.id, r.messaging, r.rtbMap]))
    const before = snapshot()
    await useTrafficStore.getState().applyBreakFix(breakId)
    if (snapshot() !== before) return { breakId, applied: true, via: 'suggested-fix' }
    // Fall back to the structural break set (the coherence check's own breaks).
    const brk = (useTrafficStore.getState().claudeBreaks ?? []).find((b) => b.id === breakId)
    const fix = brk?.suggestedFix
    if (fix && fix.after && fix.after !== fix.before) {
      const row = useTrafficStore.getState().rows.find((r) => r.assetName === fix.assetName && r.channel === fix.channel)
      if (row) {
        const patch: Partial<TrafficRow> = { messaging: { ...row.messaging, [fix.field]: fix.after } }
        if (fix.attachRtb) patch.rtbMap = { ...(row.rtbMap ?? {}), [fix.field]: [fix.attachRtb] }
        await useTrafficStore.getState().updateRow(row.id, patch)
        return { breakId, applied: true, via: 'structural' }
      }
    }
    return { breakId, applied: false, note: 'No mechanical fix for this break (e.g. a duplicate or an unsubstantiated claim). Edit the asset, reject it, or delete it.' }
  },

  // Reassign an asset's proof to the one the check suggests (the proof-gap fix).
  async reassignProof(a) {
    const breakId = str(a.breakId).trim() || str(a.id).trim()
    if (!breakId) throw new Error('breakId is required')
    await useTrafficStore.getState().reassignBreakProof(breakId)
    return { breakId, reassigned: true }
  },

  // Hand-author a first-class asset into a campaign (no generation step).
  async addAsset(a) {
    const brand = str(a.brand).trim()
    const campaign = str(a.campaign).trim()
    if (!brand || !campaign) throw new Error('brand and campaign are required')
    const channel = (str(a.channel).trim() || 'Instagram') as TrafficRow['channel']
    const assetType = str(a.assetType).trim() || undefined
    const stage = str(a.stage).trim().toLowerCase()
    const patch: Partial<TrafficRow> = {
      channel,
      assetName: str(a.assetName).trim() || str(a.headline).trim() || 'Authored asset',
      audience: str(a.audience).trim() || undefined,
      format: str(a.format).trim() || undefined,
    }
    if (assetType) patch.assetType = assetType
    if (['awareness', 'consideration', 'conversion', 'retention'].includes(stage)) patch.funnelStage = stage as never
    patch.messaging = applyCopyFields(channel, assetType ?? '', {}, a)
    const proofPoints = list(a.proofPoints)
    if (proofPoints.length) {
      const ids = resolveProofIds(brand, proofPoints)
      const pk = messagingKeys(channel, assetType ?? '').primaryKey ?? 'primary'
      patch.rtbMap = { [pk]: ids }
    }
    // Provenance: a hand-written asset is 'authored'; an imported one passes source/url/media.
    const src = str(a.source).trim()
    if (['authored', 'imported', 'social-live', 'site'].includes(src)) patch.source = src as never
    if (str(a.sourceUrl).trim()) patch.sourceUrl = str(a.sourceUrl).trim()
    const mediaRefs = list(a.mediaRefs)
    if (mediaRefs.length) {
      patch.mediaRefs = mediaRefs
      patch.mediaRef = mediaRefs[0]
    }
    const row = await useTrafficStore.getState().addAsset(brand, campaign, patch)
    return { id: row.id, assetName: row.assetName, brand, campaign, source: row.source, status: row.status }
  },

  // Bulk-import real content into a canvas as first-class assets (Buffer posts, scraped
  // site/case studies, a pasted audit). Each item is mapped to a row; re-import dedups.
  async importAssets(a) {
    const brand = str(a.brand).trim()
    const campaign = str(a.campaign).trim()
    const sourceRaw = str(a.source).trim()
    const sources = ['authored', 'imported', 'social-live', 'site', 'buffer', 'site-map']
    if (!brand || !campaign) throw new Error('brand and campaign are required')
    if (!sources.includes(sourceRaw)) throw new Error(`source must be one of: social-live (buffer), site, imported`)
    // Aliases: buffer -> social-live, site-map -> site.
    const source = (sourceRaw === 'buffer' ? 'social-live' : sourceRaw === 'site-map' ? 'site' : sourceRaw) as never
    const items = Array.isArray(a.items) ? (a.items as Record<string, unknown>[]) : []
    if (!items.length) throw new Error('items[] is required (the posts / pages / rows to import)')
    const res = await useTrafficStore.getState().importAssets(brand, campaign, items, source)
    return {
      brand,
      campaign,
      source,
      imported: res.imported,
      updated: res.updated,
      skipped: res.skipped,
      note: `${res.imported} imported, ${res.updated} refreshed (metrics updated on existing), ${res.skipped} skipped. They're live assets in the canvas — list_assets(source:"${source}") to read them; run_coherence_check to check the real content.`,
    }
  },

  // Move a single asset through the review lifecycle.
  async setAssetStatus(a) {
    const id = str(a.assetId).trim() || str(a.id).trim()
    const status = str(a.status).trim() as RowStatus
    if (!id) throw new Error('assetId is required')
    if (!ASSET_STATUSES.includes(status)) throw new Error(`status must be one of: ${ASSET_STATUSES.join(', ')}`)
    await useTrafficStore.getState().setRowStatus(id, status, str(a.note).trim() || undefined)
    return { id, status }
  },

  // Bulk-approve: every in-scope draft/in_review asset (or an explicit id list).
  async approveAssets(a) {
    const ids = list(a.assetIds)
    const st = useTrafficStore.getState()
    let targets: string[]
    if (ids.length) targets = ids
    else {
      const campaign = str(a.campaign).trim()
      targets = st.rows
        .filter((r) => !r.archivedAt && (!campaign || (r.campaign ?? '') === campaign) && (r.status === 'draft' || r.status === 'in_review'))
        .map((r) => r.id)
    }
    for (const id of targets) await useTrafficStore.getState().setRowStatus(id, 'approved')
    return { approved: targets.length }
  },

  // Soft-delete an asset (archived, recoverable). Use purge: true for a hard delete.
  async deleteAsset(a) {
    const id = str(a.assetId).trim() || str(a.id).trim()
    if (!id) throw new Error('assetId is required')
    if (a.purge === true) {
      await useTrafficStore.getState().removeRow(id)
      return { id, purged: true }
    }
    await useTrafficStore.getState().archiveRow(id)
    return { id, archived: true, note: 'Soft-deleted. restore_asset to recover.' }
  },

  async restoreAsset(a) {
    const id = str(a.assetId).trim() || str(a.id).trim()
    if (!id) throw new Error('assetId is required')
    await useTrafficStore.getState().restoreRow(id)
    return { id, restored: true }
  },

  // Bulk soft-delete (a whole fan set, or an explicit id list). variantOf names the
  // master of a fan set: archives the master's variants.
  async deleteAssets(a) {
    const st = useTrafficStore.getState()
    let ids = list(a.assetIds)
    const ofMaster = str(a.variantOf).trim()
    if (ofMaster) ids = ids.concat(st.rows.filter((r) => (r.variantOf ?? '') === ofMaster).map((r) => r.id))
    ids = [...new Set(ids)]
    if (!ids.length) throw new Error('assetIds or variantOf is required')
    await useTrafficStore.getState().archiveRows(ids)
    return { archived: ids.length }
  },

  // Soft-delete a campaign + its assets (recoverable).
  async deleteCampaign(a) {
    const campaign = str(a.campaign).trim()
    if (!campaign) throw new Error('campaign is required')
    await useTrafficStore.getState().deleteCampaign(campaign)
    return { campaign, archived: true, note: 'Soft-deleted with its assets. restore_campaign to recover.' }
  },

  async restoreCampaign(a) {
    const campaign = str(a.campaign).trim()
    if (!campaign) throw new Error('campaign is required')
    await useTrafficStore.getState().restoreCampaign(campaign)
    return { campaign, restored: true }
  },

  // Delete a client/brand and all its assets. This is a HARD delete (permanent) — use
  // it to clear setup-failure junk brands.
  async deleteClient(a) {
    const name = str(a.name).trim() || str(a.brand).trim()
    if (!name) throw new Error('name is required')
    await useTrafficStore.getState().deleteClient(name)
    return { name, deleted: true, permanent: true }
  },

  // Approve or reject a library item (audience / proof / hook / cta / subject). Reject
  // removes the unvetted draft.
  async setLibraryItemStatus(a) {
    const brand = str(a.brand).trim()
    const kind = str(a.kind).trim()
    const id = str(a.id).trim()
    const status = str(a.status).trim()
    if (!brand || !kind || !id) throw new Error('brand, kind, and id are required')
    const valid = ['ctas', 'rtbs', 'audiences', 'strategies', 'subjects', 'hooks']
    if (!valid.includes(kind)) throw new Error(`kind must be one of: ${valid.join(', ')}`)
    const store = useTrafficStore.getState()
    store.setMessagingBrand(brand)
    if (status === 'approved') store.approveLibraryItem(kind as never, id)
    else if (status === 'rejected') store.removeLibraryItem(kind as never, id)
    else throw new Error('status must be approved or rejected')
    return { brand, kind, id, status }
  },

  // ---- Personalization fan-out (Phase 1) ----

  // Count-before-commit: what a dimension card would create, without fanning.
  async fanOutPreview(a) {
    const campaign = str(a.campaign).trim()
    const dimension = str(a.dimension).trim()
    if (!campaign || !dimension) throw new Error('campaign and dimension are required')
    const values = list(a.values)
    const exclude = Array.isArray(a.exclude) ? (a.exclude as Record<string, string>[]) : []
    const plan = useTrafficStore.getState().fanOutPreview(campaign, dimension, values.length ? values : undefined, exclude)
    return {
      ...plan,
      note: `Adding a ${dimension} card creates ${plan.variantCount} variants (${plan.baseCount} base × ${plan.values.length} values${plan.pruned ? `, ${plan.pruned} pruned` : ''}). Run the coherence check after to surface only the breaking variants.`,
    }
  },

  // Fan the base into one lineage-tagged variant per value, then generate per variant.
  async fanOut(a) {
    const campaign = str(a.campaign).trim()
    const dimension = str(a.dimension).trim()
    if (!campaign || !dimension) throw new Error('campaign and dimension are required')
    const values = list(a.values)
    const exclude = Array.isArray(a.exclude) ? (a.exclude as Record<string, string>[]) : []
    const generate = a.generate !== false
    const res = await useTrafficStore
      .getState()
      .fanOut(campaign, dimension, values.length ? values : undefined, { exclude, generate })
    return { campaign, dimension, ...res }
  },

  // Propose conditional logic ("if audience = X then proof Y") from the brand's library
  // associations. Everything lands proposed — a human approves before it shapes copy.
  async proposeConditions(a) {
    const campaign = str(a.campaign).trim()
    if (!campaign) throw new Error('campaign is required')
    const conditions = useTrafficStore.getState().proposeConditions(campaign)
    return {
      campaign,
      count: conditions.length,
      conditions: conditions.map((c) => ({ id: c.id, sentence: conditionSentence(c), rationale: c.rationale, confidence: c.confidence, status: c.status })),
      note: conditions.length
        ? `${conditions.length} conditions proposed. Approve the ones that fit, then fan out — approved conditions repoint each variant's proof/hook/CTA or prune the combination.`
        : 'No conditions could be inferred yet. Connect more audience proof points and CTAs, then re-propose.',
    }
  },

  // List the conditions on a campaign (so Claude can read state before approving).
  async listConditions(a) {
    const campaign = str(a.campaign).trim()
    if (!campaign) throw new Error('campaign is required')
    const conditions = useTrafficStore.getState().campaignConditions[campaign] ?? []
    return {
      campaign,
      conditions: conditions.map((c) => ({ id: c.id, sentence: conditionSentence(c), rationale: c.rationale, confidence: c.confidence, status: c.status })),
    }
  },

  // Approve / reject a proposed condition. Only approved conditions shape generation.
  async setConditionStatus(a) {
    const campaign = str(a.campaign).trim()
    const id = str(a.id).trim()
    const status = str(a.status).trim()
    if (!campaign || !id) throw new Error('campaign and id are required')
    if (status !== 'approved' && status !== 'rejected' && status !== 'proposed') throw new Error('status must be approved, rejected, or proposed')
    useTrafficStore.getState().setConditionStatus(campaign, id, status)
    const c = (useTrafficStore.getState().campaignConditions[campaign] ?? []).find((x) => x.id === id)
    return { campaign, id, status, sentence: c ? conditionSentence(c) : null }
  },

  // ---- Brand boundary: the canvas's coherence baseline + brand tree ----
  // Read a brand's effective baseline: the voice / proof in force and where it comes
  // from (self + inherited ancestors + explicitly shared). What the canvas measures against.
  async getBrandBaseline(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    const b = useTrafficStore.getState().brandBaselineFor(brand)
    return {
      brand: b.brand,
      draft: b.draft,
      voice: b.voice ?? null,
      proofCount: b.proofCount,
      audienceCount: b.audienceCount,
      sources: b.sources,
      note: 'Generation and the coherence check read ONLY these sources. Nothing outside this scope can cross the brand boundary.',
    }
  },

  // Set (or clear with parent='') a brand's parent, so it inherits the parent's proof /
  // values / audiences. Cycles and self-parenting are rejected by the store.
  async setBrandParent(a) {
    const brand = str(a.brand).trim()
    const parent = str(a.parent).trim()
    if (!brand) throw new Error('brand is required')
    useTrafficStore.getState().setBrandParent(brand, parent || null)
    return { brand, parent: parent || null, baseline: useTrafficStore.getState().brandBaselineFor(brand).sources }
  },

  // Explicitly attach (on=true) or detach another brand's library as a shared source —
  // the only deliberate way assets cross between unrelated brands.
  async setBrandShare(a) {
    const brand = str(a.brand).trim()
    const share = str(a.share).trim()
    const on = a.on !== false
    if (!brand || !share) throw new Error('brand and share are required')
    useTrafficStore.getState().setBrandShare(brand, share, on)
    return { brand, share, on, baseline: useTrafficStore.getState().brandBaselineFor(brand).sources }
  },

  // Mark a brand a lightweight draft (sketch) or clear the flag. A draft brand is a real,
  // isolated binding — it can generate — and can be promoted later.
  async setBrandDraft(a) {
    const brand = str(a.brand).trim()
    const draft = a.draft !== false
    if (!brand) throw new Error('brand is required')
    useTrafficStore.getState().setBrandDraft(brand, draft)
    return { brand, draft }
  },

  // Promote a draft brand into a real brand (optionally renaming), carrying its library,
  // profile, and campaigns.
  async promoteBrand(a) {
    const draftBrand = str(a.brand).trim()
    const realName = str(a.realName).trim()
    if (!draftBrand) throw new Error('brand is required')
    useTrafficStore.getState().promoteBrand(draftBrand, realName || undefined)
    return { promoted: realName || draftBrand, from: draftBrand }
  },

  // ---- ABM: target accounts ----
  // Add a target account under a brand. `committee` is an array of { role, concern }.
  async addAccount(a) {
    const brand = str(a.brand).trim()
    const name = str(a.name).trim()
    if (!brand || !name) throw new Error('brand and name are required')
    const tier = str(a.tier).trim()
    const status = str(a.status).trim()
    const committee = Array.isArray(a.committee)
      ? (a.committee as Record<string, unknown>[]).map((m) => ({ role: str(m.role).trim(), concern: str(m.concern).trim() || undefined })).filter((m) => m.role)
      : undefined
    const acct = useTrafficStore.getState().addAccount(brand, {
      name,
      domain: str(a.domain).trim() || undefined,
      segment: str(a.segment).trim() || undefined,
      tier: (tier === '1:1' || tier === '1:few' || tier === '1:many' ? tier : undefined) as never,
      status: (['target', 'engaged', 'meeting', 'pipeline', 'won', 'lost'].includes(status) ? status : undefined) as never,
      notes: str(a.notes).trim() || undefined,
      committee,
    })
    return { id: acct.id, name: acct.name, brand, tier: acct.tier, status: acct.status }
  },

  // Create a target list under a brand from account NAMES (creating any that don't exist
  // yet), and optionally attach it to a campaign. The ABM target list in one call.
  async createTargetList(a) {
    const brand = str(a.brand).trim()
    const name = str(a.name).trim()
    if (!brand || !name) throw new Error('brand and name are required')
    const st = useTrafficStore.getState()
    const wanted = list(a.accounts)
    const existing = new Map((st.accountsByBrand[brand] ?? []).map((x) => [x.name.toLowerCase(), x]))
    const ids = wanted.map((n) => {
      const found = existing.get(n.toLowerCase())
      return found ? found.id : useTrafficStore.getState().addAccount(brand, { name: n }).id
    })
    const list_ = useTrafficStore.getState().createTargetList(brand, name, ids)
    const campaign = str(a.campaign).trim()
    if (campaign) useTrafficStore.getState().attachTargetList(campaign, list_.id)
    return { id: list_.id, name: list_.name, brand, accounts: wanted, attachedTo: campaign || null }
  },

  // Remove a target account from a brand (also drops it from any target list).
  async removeAccount(a) {
    const brand = str(a.brand).trim()
    const id = str(a.id).trim()
    if (!brand || !id) throw new Error('brand and id are required')
    useTrafficStore.getState().removeAccount(brand, id)
    return { brand, removed: id }
  },

  // Delete a target list (and detach it from any campaign).
  async removeTargetList(a) {
    const listId = str(a.listId).trim()
    if (!listId) throw new Error('listId is required')
    useTrafficStore.getState().removeTargetList(listId)
    return { removed: listId }
  },

  // Attach (or clear with listId='') the target list a campaign targets.
  async attachTargetList(a) {
    const campaign = str(a.campaign).trim()
    const listId = str(a.listId).trim()
    if (!campaign) throw new Error('campaign is required')
    useTrafficStore.getState().attachTargetList(campaign, listId || null)
    return { campaign, listId: listId || null }
  },

  // List a brand's accounts (and which list a campaign targets) so Claude can see state.
  async listAccounts(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    const st = useTrafficStore.getState()
    const accounts = (st.accountsByBrand[brand] ?? []).map((x) => ({ id: x.id, name: x.name, segment: x.segment ?? null, tier: x.tier, status: x.status }))
    const lists = st.targetLists.filter((l) => l.brand === brand).map((l) => ({ id: l.id, name: l.name, count: l.accountIds.length }))
    return { brand, accounts, targetLists: lists }
  },

  // Read back what's connected for a brand, so Claude can see before it writes.
  async getBrand(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    const st = useTrafficStore.getState()
    const sys = st.brandSystems[brand]
    const prof = st.clientProfiles[brand] ?? {}
    const strat = prof.strategy ? GTM_STRATEGIES.find((s) => s.key === prof.strategy) : undefined
    return {
      brand,
      profile: prof,
      strategy: prof.strategy
        ? {
            key: prof.strategy,
            name: strat?.name ?? prof.strategy,
            secondary: prof.secondaryStrategy ?? null,
            rationale: prof.strategyRationale ?? null,
            confidence: prof.strategyConfidence ?? null,
            signalsUsed: prof.strategySignals ?? [],
          }
        : null,
      system: sys
        ? {
            audiences: sys.audiences.map((x) => x.name),
            proofPoints: sys.rtbs.map((x) => x.label),
            subjects: sys.subjects.map((x) => x.text),
            hooks: sys.hooks.map((x) => x.text),
            ctas: sys.ctas.map((x) => x.label),
          }
        : null,
      campaigns: st.campaignList.filter((c) => c.client === brand && !c.archivedAt).map((c) => c.name),
      assets: st.rows.filter((r) => clientForCampaign(r.campaign) === brand).length,
    }
  },
}

let started = false
let es: EventSource | null = null

function onCommand(e: Event): void {
  void (async () => {
    const cmd = JSON.parse((e as MessageEvent).data) as { id: string; action: string; args?: Args }
    let payload: Record<string, unknown>
    try {
      const h = handlers[cmd.action]
      if (!h) throw new Error(`unknown action: ${cmd.action}`)
      payload = { id: cmd.id, result: await h(cmd.args ?? {}) }
    } catch (err) {
      payload = { id: cmd.id, error: String((err as Error)?.message ?? err) }
    }
    void fetch('/api/agent-result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  })()
}

// When the dev server restarts, the tab may hold stale modules (the cause of
// "unknown action" on newly added tools). The server stamps each start with a
// boot id; if we reconnect to a DIFFERENT one, reload to pick up fresh code.
function onReady(e: Event): void {
  try {
    const { bootId } = JSON.parse((e as MessageEvent).data) as { bootId?: string }
    if (!bootId || typeof sessionStorage === 'undefined') return
    const KEY = 'hf.bridgeBoot'
    const prev = sessionStorage.getItem(KEY)
    sessionStorage.setItem(KEY, bootId) // set first so the post-reload connect won't loop
    if (prev && prev !== bootId) location.reload()
  } catch {
    /* ignore malformed ready events */
  }
}

/** Open the bridge stream and execute commands as they arrive. Idempotent. */
export function startAgentBridge(): void {
  if (started || typeof EventSource === 'undefined') return
  started = true
  es = new EventSource('/api/agent-bridge')
  es.addEventListener('ready', onReady)
  es.addEventListener('command', onCommand)
}

// Dev only: hot-swap the bridge when this module is edited, so new handlers go
// live without a manual tab reload (and we never leave a stale listener attached
// to the old handler registry). Stripped from production builds.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    es?.close()
    es = null
    started = false
  })
  import.meta.hot.accept((mod) => {
    ;(mod as { startAgentBridge?: () => void } | undefined)?.startAgentBridge?.()
  })
}
