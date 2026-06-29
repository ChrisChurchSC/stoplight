/**
 * The 10 go-to-market strategies a client's campaign can run, from the GTM
 * Strategy Benchmarks reference. Shown in the new-client wizard's strategy step.
 * `sequence`, `bestFor`, `coreMetrics`, and `mediaContent` come from the
 * workbook's Overview tab (planning guidance — medians/ranges, not targets).
 */
/** A recommended GTM motion derived from a brand's business-model signals. */
export interface StrategyInference {
  /** Primary motion key (a GTM_STRATEGIES key). */
  strategy: string
  /** Optional secondary motion (motions combine, e.g. PLG core + demand-capture feeder). */
  secondaryStrategy?: string
  confidence: 'low' | 'medium' | 'high'
  /** Human-readable reason, so the user can see why and trust it. */
  rationale: string
  /** The signals the call was grounded in. */
  signalsUsed: string[]
}

/**
 * Rule-based GTM-motion inference from business-model signal text (site copy,
 * notes, ad copy). The heuristic setup fallback uses this so a keyless setup is
 * still derived, not hardcoded; the Claude path reasons over the full crawl and
 * returns its own inference. Maps signals → one of the GTM_STRATEGIES keys.
 */
export function inferStrategy(signalText: string): StrategyInference {
  const t = (signalText || '').toLowerCase()
  const hits = (...kw: string[]) => kw.filter((k) => t.includes(k))
  const signals: string[] = []
  const note = (label: string, kws: string[]) => {
    if (kws.length) signals.push(`${label} (${[...new Set(kws)].slice(0, 4).join(', ')})`)
  }

  const free = hits('free tier', 'freemium', 'free plan', 'free app', 'free forever', 'start free', 'sign up free', 'download', 'app store', 'google play', 'no credit card')
  const selfServe = hits('sign up', 'get started', 'try it free', 'try for free', 'create account', 'self-serve', 'self service', 'start building')
  const contactSales = hits('contact sales', 'talk to sales', 'request a demo', 'book a demo', 'get a quote', 'custom pricing', 'sso', 'soc 2', 'procurement')
  const enterprise = hits('enterprise', 'mid-market', 'large organizations', 'annual contract', 'platform for teams', 'fortune 500', 'acv')
  const adSupported = hits('adsense', 'ad-supported', 'ad supported', 'sponsored', 'advertise with us', 'sponsorship')
  const community = hits('community', 'creator', 'newsletter', 'podcast', 'discord', 'forum', 'members', 'subscribers', 'audience', 'content library')
  const b2c = hits('anglers', 'angler', 'fishing', 'fish', 'boaters', 'recreational', 'consumer', 'for everyone', 'personal', 'families', 'hobby', 'fans', 'enthusiasts', 'players', 'athletes', 'everyday', 'app store', 'google play', 'download the app')

  note('free / self-serve signup', [...free, ...selfServe])
  note('sales-assisted', [...contactSales, ...enterprise])
  note('ad-supported', adSupported)
  note('community / content', community)
  note('B2C / consumer', b2c)

  // PLG: a free/freemium self-serve product is the funnel (in-app upgrade), OR a
  // consumer product with no sales-assisted path (consumer apps are inherently
  // product-led: people find, adopt, and upgrade themselves).
  const consumerLed = b2c.length > 0 && !contactSales.length && !enterprise.length
  if ((free.length && selfServe.length) || (free.length >= 2 && !contactSales.length) || consumerLed) {
    const freeSig = [...free, ...selfServe]
    const why = freeSig.length
      ? `Free, self-serve signals (${freeSig.slice(0, 3).join(', ')}) point to product-led growth: the product is the funnel and users adopt and upgrade themselves, not through a sales team.`
      : `A consumer audience (${b2c.slice(0, 3).join(', ')}) with no sales-assisted path points to product-led growth: a self-serve consumer product where the product is the funnel.`
    return {
      strategy: 'plg',
      secondaryStrategy: adSupported.length ? 'demand-gen' : undefined,
      confidence: free.length >= 2 && selfServe.length ? 'high' : freeSig.length || b2c.length >= 2 ? 'medium' : 'low',
      rationale: why,
      signalsUsed: signals,
    }
  }
  // Sales-led / ABM: high ACV, contact-sales, no self-serve path.
  if (contactSales.length && !free.length) {
    return {
      strategy: enterprise.length ? 'abm' : 'sales-led',
      confidence: contactSales.length >= 2 ? 'medium' : 'low',
      rationale: `Sales-assisted signals (${[...contactSales, ...enterprise].slice(0, 3).join(', ')}) and no self-serve path point to a ${enterprise.length ? 'named-account ABM' : 'sales-led'} motion with a dedicated sales team.`,
      signalsUsed: signals,
    }
  }
  // Community / content-led: audience-first, organic.
  if (community.length >= 2 && !contactSales.length) {
    return {
      strategy: 'community',
      secondaryStrategy: 'content-seo',
      confidence: 'medium',
      rationale: `Audience-first signals (${community.slice(0, 3).join(', ')}) point to a community / content-led motion where the audience and content engine drive growth.`,
      signalsUsed: signals,
    }
  }
  // Default: demand generation (low confidence when signals are thin).
  return {
    strategy: 'demand-gen',
    confidence: 'low',
    rationale: signals.length
      ? 'No strong product-led, sales-led, or community signals; defaulting to demand generation to capture intent across paid and content.'
      : 'No business-model signals were available; defaulting to demand generation. Connect the site or set the strategy manually for a grounded recommendation.',
    signalsUsed: signals,
  }
}

/** Normalize a strategy label for matching: lowercase, hyphens/slashes/underscores
 *  to spaces, drop punctuation. So "Demand-Gen", "demand gen", "Demand Gen Funnel"
 *  all compare cleanly. */
const normStrategy = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Common colloquial names → canonical key (normalized form on the left). */
const STRATEGY_ALIASES: Record<string, string> = {
  'product led growth': 'plg',
  'product led': 'plg',
  'demand generation': 'demand-gen',
  'sales led growth': 'sales-led',
  'account based marketing': 'abm',
  'account based': 'abm',
  'community led': 'community',
  'content and seo': 'content-seo',
  'content seo engine': 'content-seo',
  'pirate metrics': 'aarrr',
  'outbound sdr': 'outbound',
  'customer lifecycle': 'lifecycle',
}

/**
 * Resolve a user-supplied strategy label (key, full name, or common alias) to a
 * canonical GTM_STRATEGIES key. Returns null if it matches nothing — callers
 * should treat that as an explicit error, not a silent fallback.
 */
export function resolveStrategyKey(input: string): string | null {
  const n = normStrategy(input)
  if (!n) return null
  for (const s of GTM_STRATEGIES) {
    if (normStrategy(s.key) === n || normStrategy(s.name) === n) return s.key
  }
  const aliased = STRATEGY_ALIASES[n]
  if (aliased) {
    const m = GTM_STRATEGIES.find((s) => s.key === aliased)
    if (m) return m.key
  }
  return null
}

export interface GtmStrategy {
  key: string
  name: string
  /** The stage flow this motion runs through. */
  sequence: string
  /** Who it fits best. */
  bestFor: string
  /** North-star KPIs to watch. */
  coreMetrics: string
  /** Recommended paid-media : content-production spend split. */
  mediaContent: string
}

/** The paid-media share (%) from a strategy's "media : content" split, or null
 *  when it has no fixed split (e.g. AARRR "follows the underlying motion"). */
export function mediaSharePct(s: GtmStrategy): number | null {
  const m = s.mediaContent.match(/(\d+)\s*:\s*(\d+)/)
  return m ? Number(m[1]) : null
}

/**
 * The ordered stage labels a playbook runs through, parsed from its `sequence`
 * ("Visitor → Lead → MQL → SQL → Opp → Closed" → six labels). Trailing
 * parenthetical notes are dropped, so "Convert (+ program outcomes)" → "Convert".
 * These become the funnel bands on the canvas when a campaign is linked to the
 * playbook — the journey reads in the playbook's own vocabulary, not the generic
 * Awareness → Retention funnel.
 */
export function playbookStages(sequence: string): string[] {
  return sequence
    .split(/→|->/)
    .map((s) => s.replace(/\([^)]*\)/g, '').trim())
    .filter(Boolean)
}

/**
 * Project one of the canonical funnel positions (0..canonCount-1) onto a
 * playbook of `nPhases` stages by proportional position. Channels resolve to the
 * canonical 4-stage funnel; this maps that position into the playbook's own
 * sequence so a card lands in the nearest playbook stage. Identity when the
 * playbook has exactly 4 stages (and for the generic 4-stage fallback).
 */
export function canonToPhase(canonIdx: number, canonCount: number, nPhases: number): number {
  if (nPhases <= 1) return 0
  const pos = canonCount <= 1 ? 0 : canonIdx / (canonCount - 1)
  return Math.min(nPhases - 1, Math.max(0, Math.round(pos * (nPhases - 1))))
}

/** Inverse of {@link canonToPhase}: the canonical funnel stage a playbook phase
 *  best represents, so restaging a card into a playbook band still writes a
 *  canonical funnelStage the rest of the engine understands. */
export function phaseToCanon(phaseIdx: number, nPhases: number, canonCount: number): number {
  if (canonCount <= 1) return 0
  const pos = nPhases <= 1 ? 0 : phaseIdx / (nPhases - 1)
  return Math.min(canonCount - 1, Math.max(0, Math.round(pos * (canonCount - 1))))
}

export const GTM_STRATEGIES: GtmStrategy[] = [
  {
    key: 'demand-gen',
    name: 'Demand Gen Funnel',
    sequence: 'Visitor → Lead → MQL → SQL → Opp → Closed',
    bestFor: 'B2B/B2C teams building predictable inbound pipeline across multiple channels',
    coreMetrics: 'Lead→customer rate · cost per lead · MQL→SQL conversion',
    mediaContent: '~60 : 40 (paid-media heavy)',
  },
  {
    key: 'plg',
    name: 'PLG Flywheel',
    sequence: 'Activate → Adopt → Convert → Expand → Advocate',
    bestFor: 'Self-serve SaaS with low ACV, fast time-to-value, bottoms-up adoption',
    coreMetrics: 'Activation rate · free→paid % · NRR · time-to-value',
    mediaContent: '~20 : 80 (content/product heavy)',
  },
  {
    key: 'sales-led',
    name: 'Sales-Led Growth',
    sequence: 'Lead → MQL → SQL → Opp → (Demo) → Closed',
    bestFor: 'High-ACV, complex/considered B2B sales with a dedicated sales team',
    coreMetrics: 'Win rate · MQL→SQL · sales-cycle length · pipeline coverage',
    mediaContent: '~30 : 70 (enablement over media)',
  },
  {
    key: 'lifecycle',
    name: 'Customer Lifecycle',
    sequence: 'Awareness → Onboard → Adopt → Retain → Advocate',
    bestFor: 'Subscription/recurring-revenue businesses optimizing retention & LTV',
    coreMetrics: 'NRR · gross churn · CLV · feature adoption',
    mediaContent: '~10 : 90 (almost all content/CS)',
  },
  {
    key: 'aarrr',
    name: 'AARRR Metrics',
    sequence: 'Acquisition → Activation → Retention → Referral → Revenue',
    bestFor: 'Early-stage startups & growth teams wanting one simple end-to-end framework',
    coreMetrics: 'Activation · retention/churn · k-factor · ARPU / LTV',
    mediaContent: 'Follows the underlying motion',
  },
  {
    key: 'bowtie',
    name: 'Bowtie Funnel',
    sequence: 'Acquire → Close → Onboard → Adopt → Expand → Renew',
    bestFor: 'RevOps / land-and-expand SaaS connecting pre- and post-sale revenue',
    coreMetrics: 'NRR · expansion rate · GRR · win rate',
    mediaContent: '~40 : 60 (media front, content back)',
  },
  {
    key: 'abm',
    name: 'ABM',
    sequence: 'Engage → Convert (+ program outcomes)',
    bestFor: 'Enterprise teams targeting a small set of high-value named accounts',
    coreMetrics: 'Account win rate · engagement score · pipeline contribution · deal size',
    mediaContent: '~50 : 50 (targeted ads + custom content)',
  },
  {
    key: 'content-seo',
    name: 'Content + SEO Engine',
    sequence: 'Research → Distribute → Capture → Analyze',
    bestFor: 'Teams investing in compounding organic growth over a 6–24 month horizon',
    coreMetrics: 'Organic visitor→lead · rankings/CTR · organic traffic growth',
    mediaContent: '~15 : 85 (mostly content)',
  },
  {
    key: 'outbound',
    name: 'Outbound / SDR',
    sequence: 'Contact → Reply → Meeting → Opportunity',
    bestFor: 'Teams with defined ICPs & target lists generating pipeline proactively',
    coreMetrics: 'Reply rate · meetings booked/mo · pipeline per SDR',
    mediaContent: '~10 : 90 (people/content, little paid)',
  },
  {
    key: 'community',
    name: 'Community-Led',
    sequence: 'Join → Engage → Contribute → Convert → Retain',
    bestFor: 'Products with engaged users/developers where peer support scales',
    coreMetrics: 'Engagement rate · DAU/MAU · community-influenced revenue · CAC',
    mediaContent: '~15 : 85 (content/programming heavy)',
  },
  {
    key: 'local-takeover',
    name: 'Local Takeover',
    sequence: 'Discover → Visit → Convert → Repeat → Refer',
    bestFor: 'Local & multi-location businesses saturating a geographic market across every nearby touchpoint',
    coreMetrics: 'Local-pack rank · store/site visits · cost per walk-in · review velocity · radius reach',
    mediaContent: '~55 : 45 (geo-paid + local content)',
  },
]
