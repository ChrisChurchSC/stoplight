/**
 * The 10 go-to-market strategies a client's campaign can run, from the GTM
 * Strategy Benchmarks reference. Shown in the new-client wizard's strategy step.
 * `sequence`, `bestFor`, `coreMetrics`, and `mediaContent` come from the
 * workbook's Overview tab (planning guidance — medians/ranges, not targets).
 */
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
