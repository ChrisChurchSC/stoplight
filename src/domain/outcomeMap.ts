import { mockAttio } from '../adapters/attio/mockAttio'
import type { AudienceType } from './audiences'
import type { Campaign } from './clients'
import { clientForCampaign } from './clients'
import { funnelStageFor, type FunnelStage } from './funnel'
import { messagingSummary } from './messaging'
import { assetRtbIds, rtbById } from './rtb'
import { archetypeFor, archetypeLabel } from './archetypes'
import type { ChannelId, TrafficRow } from './types'

/**
 * The Proprietary Outcome Map.
 *
 * One row per shipped variant, joining what it WAS (structured attributes) to
 * what it DID (outcomes), keyed by the tracking id written at trafficking. This
 * is the operational, per-customer layer — the customer's own data. The
 * anonymized cross-customer learning layer is derived from it separately (see
 * outcomePatterns.ts); the two never mix client-identifying data.
 *
 * Audience type is a primary dimension throughout, so every fact can be sliced
 * by WHO it targeted.
 */

export const UNSEGMENTED = 'Unsegmented'

/** Structured attributes of a shipped variant — "what it was". */
export interface VariantAttributes {
  audienceType: string
  /** Persona archetype (normalized from audienceType) — the cross-customer grouping key. */
  archetype: string
  stage: FunnelStage
  channel: ChannelId
  assetType: string
  /** The core message (a proxy for the angle), read from the messaging fields. */
  messageAngle: string
  /** Proof points deployed on the variant. */
  rtbs: { id: string; label: string }[]
  campaign: string
  /** Resolved from the campaign — never a re-identifying key in the aggregate layer. */
  client: string
  strategy: string
  scheduledAt: string
}

/** Outcomes a variant drove — "what it did" — joined through the tracking id. */
export interface VariantOutcomes {
  impressions: number
  clicks: number
  /** clicks / impressions. */
  engagementRate: number
  leads: number
  opportunities: number
  /** Multi-touch credited revenue (split across the journey path). */
  revenue: number
  spend: number
}

/** One row of the outcome map: attributes joined to outcomes by tracking id. */
export interface OutcomeRow {
  variantId: string
  /** The join key: the utm content tag written at trafficking (falls back to the row id). */
  trackingId: string
  assetName: string
  attributes: VariantAttributes
  outcomes: VariantOutcomes
}

export interface OutcomeMapOpts {
  clientAudiences: Record<string, AudienceType[]>
  campaigns: Campaign[]
}

/** Stable, seedless hash → deterministic mock engagement (survives reloads). */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

/** Channel click-through baselines for the deterministic engagement mock. */
const CTR: Partial<Record<ChannelId, number>> = {
  'meta-ads': 0.012,
  'tiktok-ads': 0.009,
  'linkedin-ads': 0.006,
  'x-ads': 0.008,
  'google-search': 0.04,
  'google-demand': 0.012,
  pmax: 0.015,
  email: 0.025,
  'landing-page': 0.05,
}

/**
 * Multi-touch revenue per asset name. For each closed-won deal we walk the
 * journey path forward from its first-touch asset (linksTo chain) and split the
 * revenue linearly across every asset on the path — so an ad, its landing page,
 * and the nurture email each get credit, not just the first touch.
 */
export function multiTouchRevenueByAsset(rows: TrafficRow[]): Map<string, number> {
  const linksByName = new Map<string, string>()
  for (const r of rows) if (r.linksTo) linksByName.set(r.assetName, r.linksTo)

  const path = (start: string): string[] => {
    const out: string[] = []
    const seen = new Set<string>()
    let cur: string | undefined = start
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      out.push(cur)
      cur = linksByName.get(cur)
    }
    return out
  }

  const revenue = new Map<string, number>()
  for (const deal of mockAttio.listDeals()) {
    if (deal.stage !== 'closed-won' || !deal.sourceAsset) continue
    const p = path(deal.sourceAsset)
    const share = deal.amount / p.length
    for (const name of p) revenue.set(name, (revenue.get(name) ?? 0) + share)
  }
  return revenue
}

/** Build the outcome map: one OutcomeRow per shipped (posted/scheduled) variant. */
export function buildOutcomeMap(rows: TrafficRow[], opts: OutcomeMapOpts): OutcomeRow[] {
  const strategyByCampaign: Record<string, string> = {}
  for (const c of opts.campaigns) strategyByCampaign[c.name] = c.strategy

  const mtRevenue = multiTouchRevenueByAsset(rows)
  const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0)
  // Count variants per asset so asset-level outcomes (revenue/leads) divide
  // evenly across the asset's shipped rows and the per-variant totals reconcile.
  const variantsPerAsset = new Map<string, number>()
  for (const r of rows) variantsPerAsset.set(r.assetName, (variantsPerAsset.get(r.assetName) ?? 0) + 1)

  const audienceFor = (r: TrafficRow): string => {
    if (r.audience?.trim()) return r.audience.trim()
    const client = r.client?.trim() || clientForCampaign(r.campaign)
    return opts.clientAudiences[client]?.[0]?.name?.trim() || UNSEGMENTED
  }

  return rows.map((r) => {
    const client = r.client?.trim() || clientForCampaign(r.campaign)
    const n = variantsPerAsset.get(r.assetName) ?? 1
    const attr = mockAttio.attributionForAsset(r.assetName)
    const live = r.status === 'posted'
    const spend = r.spend?.toDate ?? 0
    const ctr = CTR[r.channel] ?? 0.01

    // Prefer REAL measured performance. Imported / reconciled live posts carry socialMetrics
    // (impressions / reach / views) and engagement (likes / comments) pulled from the channel, so a
    // connected brand's outcomes are its actual numbers. Fall back to the deterministic seed
    // projection ONLY when a row has no measured data yet (a planned, not-yet-live card).
    const seed = hash(`${r.id}:${r.channel}`)
    const sm = r.socialMetrics ?? {}
    const measuredImpr = num(sm.impressions) || num(sm.reach) || num(sm.views) || num(sm.plays)
    const engTotal =
      (r.engagement ? r.engagement.likes + r.engagement.comments : 0) +
      num(sm.shares) + num(sm.saves) + num(sm.likes) + num(sm.comments)
    const measured = measuredImpr > 0 || engTotal > 0
    const impressions = measured
      ? measuredImpr || Math.round(engTotal / ctr) // engagement-only source: back out a reach estimate
      : live
        ? Math.round(spend > 0 ? spend * (18 + seed * 12) : 800 + seed * 6000)
        : 0
    const measuredClicks = num(sm.clicks) || num(sm.linkClicks) || num(sm.taps)
    const clicks = measured
      ? measuredClicks || (engTotal > 0 ? engTotal : Math.round(impressions * ctr))
      : Math.round(impressions * ctr * (0.7 + seed * 0.6))

    return {
      variantId: r.id,
      trackingId: r.utm?.content ?? r.id,
      assetName: r.assetName,
      attributes: {
        audienceType: audienceFor(r),
        archetype: archetypeLabel(archetypeFor(audienceFor(r))),
        stage: funnelStageFor(r.channel, r.assetType),
        channel: r.channel,
        assetType: r.assetType ?? '—',
        messageAngle: messagingSummary(r),
        rtbs: assetRtbIds(r).map((id) => ({ id, label: rtbById(r.campaign, id)?.label ?? id })),
        campaign: (r.campaign ?? '').trim(),
        client,
        strategy: strategyByCampaign[(r.campaign ?? '').trim()] ?? '',
        scheduledAt: r.scheduledAt,
      },
      outcomes: {
        impressions,
        clicks,
        engagementRate: num(sm.engagementRate) || (impressions > 0 ? clicks / impressions : 0),
        // A real post has real reach but UNKNOWN revenue until a CRM is wired, so measured rows carry
        // 0 for the mock CRM-derived fields; the aggregate then ranks them by real engagement instead
        // of mockAttio's fabricated money. Non-measured (planned) rows keep the projection.
        leads: measured ? 0 : attr.leads / n,
        opportunities: measured ? 0 : attr.openDeals / n,
        revenue: measured ? 0 : (mtRevenue.get(r.assetName) ?? 0) / n,
        spend,
      },
    }
  })
}

export interface AudienceOutcome {
  audienceType: string
  variants: number
  impressions: number
  clicks: number
  engagementRate: number
  leads: number
  revenue: number
  spend: number
  topRtb: string | null
  topChannel: ChannelId | null
}

/** Operational slice: roll the outcome map up by audience type (per-customer). */
export function summarizeByAudience(map: OutcomeRow[]): AudienceOutcome[] {
  const groups = new Map<string, OutcomeRow[]>()
  for (const row of map) {
    const k = row.attributes.audienceType
    ;(groups.get(k) ?? groups.set(k, []).get(k)!).push(row)
  }
  return [...groups.entries()]
    .map(([audienceType, rs]) => {
      const impressions = rs.reduce((a, r) => a + r.outcomes.impressions, 0)
      const clicks = rs.reduce((a, r) => a + r.outcomes.clicks, 0)
      // Top proof + channel by credited revenue within the audience.
      /**
       * KEYED ON THE PROOF POINT'S ID, DISPLAYED BY ITS LABEL.
       *
       * This aggregated on the label, which is neither unique nor stable. Two proof points worded
       * the same way merged into one line and reported their combined revenue as either's; and
       * renaming a proof point split its own history in half, so the thing you renamed appeared to
       * have earned nothing since. A label is what a person reads, not what a record IS.
       */
      const rtbRev = new Map<string, number>()
      const rtbLabel = new Map<string, string>()
      const chanRev = new Map<ChannelId, number>()
      for (const r of rs) {
        for (const rtb of r.attributes.rtbs) {
          rtbRev.set(rtb.id, (rtbRev.get(rtb.id) ?? 0) + r.outcomes.revenue)
          rtbLabel.set(rtb.id, rtb.label)
        }
        chanRev.set(r.attributes.channel, (chanRev.get(r.attributes.channel) ?? 0) + r.outcomes.revenue)
      }
      const top = <T,>(m: Map<T, number>): T | null =>
        [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      return {
        audienceType,
        variants: rs.length,
        impressions,
        clicks,
        engagementRate: impressions > 0 ? clicks / impressions : 0,
        leads: rs.reduce((a, r) => a + r.outcomes.leads, 0),
        revenue: rs.reduce((a, r) => a + r.outcomes.revenue, 0),
        spend: rs.reduce((a, r) => a + r.outcomes.spend, 0),
        // Back to a label for display — the aggregation was by id, the reader sees words.
        topRtb: (() => {
          const id = top(rtbRev)
          return id ? (rtbLabel.get(id) ?? id) : null
        })(),
        topChannel: top(chanRev),
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
}
