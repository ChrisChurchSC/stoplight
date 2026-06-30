import { useTrafficStore } from '../store/useTrafficStore'
import { mapSite } from '../adapters/setup/siteMap'
import { newAudience } from '../domain/audiences'
import { newDescriptor } from '../domain/descriptors'
import { newLibraryCta } from '../domain/library'
import { clientForCampaign } from '../domain/clients'
import { funnelStageFor } from '../domain/funnel'
import { messagingFields } from '../domain/messaging'
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
    return {
      client: st.clientFilter,
      campaign: campaign || 'All campaigns',
      live: st.coherenceLive,
      breakCount: breaks.length,
      breaks: breaks.map((b) => ({ axis: b.axis, severity: b.severity, headline: b.headline })),
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
    const after = countFor()
    // Echo the applied strategy KEY (so result.strategy === the requested key) plus
    // its display name and the deliverable count, which differs by motion.
    return {
      brand,
      campaign,
      strategy: key,
      strategyName: strat?.name ?? 'Demand Gen',
      audiences,
      deliverableSet: deliverables.length,
      assetsGenerated: Math.max(0, after - before),
      totalAssets: after,
    }
  },

  // Read back each generated asset's copy, so uniqueness is verifiable in-tool.
  async listAssets(a) {
    const brand = str(a.brand).trim()
    const campaign = str(a.campaign).trim()
    if (!brand) throw new Error('brand is required')
    const st = useTrafficStore.getState()
    const proofLabel = new Map<string, string>()
    for (const rtb of st.brandSystems[brand]?.rtbs ?? []) proofLabel.set(rtb.id, rtb.label)
    const brandCtas = st.brandSystems[brand]?.ctas ?? []
    const firstSentence = (s: string) => (s.split(/(?<=[.!?])\s+/)[0] ?? s).trim()
    let rows = st.rows.filter((r) => clientForCampaign(r.campaign) === brand)
    if (campaign) rows = rows.filter((r) => (r.campaign ?? '') === campaign)
    const assets = rows.map((r) => {
      const fields = messagingFields(r.channel, r.assetType)
      const headlineKey = fields.find((f) => /headline|subject|title|subhead/i.test(f.key))?.key
      const ctaKey = fields.find((f) => /cta/i.test(f.key))?.key
      const descKey = fields.find((f) => /desc|preview/i.test(f.key))?.key
      const primaryKey = (fields.find((f) => /primary|body|caption|intro|post|message/i.test(f.key)) ?? fields[0])?.key
      const m = r.messaging ?? {}
      const stage = funnelStageFor(r.channel, r.assetType)
      const primaryText = primaryKey ? (m[primaryKey] ?? '') : ''
      // For formats whose schema lacks a role (e.g. body-only LinkedIn), surface the
      // format's EQUIVALENT so nothing reads as empty: headline -> first sentence of
      // the body; cta -> the stage-matched brand CTA the post drives to; description
      // -> a short line from the body.
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
        headline,
        primaryText,
        description,
        cta,
        /** The personalization composition this variant was fanned from. */
        lineage: r.lineage ?? {},
        /** The master this is a personalization variant of (sits side by side with it). */
        variantOf: r.variantOf ?? '',
        /** The journey step this branches off (flows forward, drawn connected). */
        branchOf: r.branchOf ?? '',
        /** Every messaging component this asset actually has, key → copy. */
        components: m,
        proofPoints: proofIds.map((id) => proofLabel.get(id) ?? id),
      }
    })
    return { brand, campaign: campaign || null, count: assets.length, assets }
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
      campaigns: st.campaignList.filter((c) => c.client === brand).map((c) => c.name),
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
