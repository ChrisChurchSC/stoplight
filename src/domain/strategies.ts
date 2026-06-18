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
]
