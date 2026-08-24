import { CHANNELS } from './channels'
import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from './funnel'
import { assetRtbIds } from './rtb'
import type { Suggestion } from './campaignReview'
import type { ChannelId, TrafficRow } from './types'

/**
 * THE CAMPAIGN REPORT: what this campaign said it would do, and what happened.
 *
 * Every reporting tool in this category opens with a revenue number and works backwards. That is a
 * dashboard. A report is an argument, and the thing that makes one possible here is the rung ladder:
 * the motion and the audience are ANSWERS somebody gave, not fields the workspace inferred, so a
 * report can be held to them. It opens with the promise and reads down.
 *
 * PURE, AND DELIBERATELY IGNORANT. It reaches for no store, no adapter and no clock. Everything it
 * cannot derive from the rows — which motion was chosen, whether a CRM is attached, what the review
 * found — arrives as input. That is not only for tests: `attributionIsSample` is carried out of the
 * domain precisely so every surface marks sample data the same way, and a report that went looking
 * for the answer itself would be the one surface entitled to a different one.
 *
 * THE LINE THIS FILE EXISTS TO HOLD is between what was MEASURED and what was PROJECTED. A single
 * figure mixing the two makes every figure beside it unfalsifiable, and a report is the artifact
 * that leaves the building and gets quoted back at you six months later. So measured reach and
 * engagement live in their own section, sourced from the channel; money lives in another, and when
 * no CRM is attached that section is WITHHELD rather than filled with zeroes. A zero in a money
 * column is read as a result. "We did not measure this" is not a result, and has to look different.
 */

export interface ReportGoal {
  message?: string
  kpi?: string
  target?: number
}

export interface ReportInput {
  /**
   * THE CAMPAIGN IS WHAT IS REPORTED ON. The brand is an attribute it may not have: a campaign made
   * as a blank canvas lives in the Drafts space and belongs to nobody, and `Drafts` / `Unassigned`
   * are catch-alls, not clients. Passing one through would head a report with a placeholder as
   * though it were the customer's name. Null when the campaign is not filed under a brand yet.
   */
  brand?: string | null
  campaign: string
  /** The campaign's assets. Archived rows are dropped here rather than by every caller. */
  rows: TrafficRow[]
  /** The GTM motion somebody chose. Absent means nobody ever answered, which the report says. */
  strategy?: string
  goal?: ReportGoal
  /** Proof points the campaign leans on, by id, so a rename does not split their history. */
  proofPoints?: { id: string; label: string }[]
  /**
   * Whether the money figures would come from a real CRM or the sample adapter. TRUE withholds the
   * money section entirely — see `money` below.
   */
  attributionIsSample: boolean
  /** The CRM behind the numbers, named in the report so the reader knows whose figures these are. */
  crm?: string | null
  /**
   * The money, from whoever holds the CRM. NOT optional decoration: with attributionIsSample false
   * and no figures supplied, the section is still withheld rather than reported as zero. This module
   * has no way to earn a revenue number and must never be able to produce one.
   */
  attribution?: { revenue: number; pipeline: number; leads: number }
  /** Findings from reviewCampaign, already ranked. */
  suggestions?: Suggestion[]
}

export interface StageShipped {
  stage: FunnelStage
  label: string
  assets: number
}
export interface ChannelShipped {
  channel: ChannelId
  label: string
  assets: number
}

/** Money is either shown, with its source named, or withheld, with the reason named. Never zeroed. */
export type MoneySection =
  | { shown: false; reason: string }
  | { shown: true; crm: string; revenue: number; pipeline: number; leads: number; spend: number; roas: number | null }

export interface ProofPerformance {
  id: string
  label: string
  assets: number
  engagement: number
  /** What the ranking is actually on, so a reader never assumes it is money. */
  basis: 'engagement'
}

export interface CampaignReport {
  /** The brand this campaign is filed under, or null when it is not filed under one. */
  brand: string | null
  campaign: string
  promise: {
    motion: string | null
    goal: ReportGoal | null
    audiences: string[]
    proofPoints: { id: string; label: string }[]
    /** Rungs nobody answered. The report is accountable to these being empty, not to filling them. */
    unanswered: string[]
  }
  shipped: {
    total: number
    live: number
    byStage: StageShipped[]
    byChannel: ChannelShipped[]
    journey: { links: number; gaps: number }
    unfinished: number
  }
  measured: {
    /** Assets carrying real numbers from the channel. Zero means measurement has not started. */
    assets: number
    impressions: number
    engagement: number
    source: 'channel' | 'none'
  }
  money: MoneySection
  proofPerformance: ProofPerformance[]
  /** Planned vs actual, over assets whose two dates were set independently. */
  timing: { compared: number; onTime: number; lateDays: number; note: string | null }
  changes: Suggestion[]
}

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0)

/**
 * Real numbers pulled back from the channel, on the same test `buildOutcomeMap` uses: a row is
 * MEASURED if the platform gave it reach or interaction. Anything else is a plan.
 */
function measuredOf(r: TrafficRow): { impressions: number; engagement: number; measured: boolean } {
  const sm = r.socialMetrics ?? {}
  const impressions = num(sm.impressions) || num(sm.reach) || num(sm.views) || num(sm.plays)
  const engagement =
    (r.engagement ? r.engagement.likes + r.engagement.comments : 0) +
    num(sm.shares) + num(sm.saves) + num(sm.likes) + num(sm.comments)
  return { impressions, engagement, measured: impressions > 0 || engagement > 0 }
}

/** Whole days late, floored — a post four hours after its slot did not slip a day. */
const daysLate = (planned: number, actual: number): number =>
  Math.max(0, Math.floor((actual - planned) / 86_400_000))

export function buildCampaignReport(input: ReportInput): CampaignReport {
  const rows = input.rows.filter((r) => !r.archivedAt)
  const suggestions = input.suggestions ?? []

  // ---- The promise: what somebody actually decided ----
  const audiences = [...new Set(rows.map((r) => (r.audience ?? '').trim()).filter(Boolean))].sort()
  const unanswered: string[] = []
  if (!input.strategy?.trim()) unanswered.push('Which GTM motion this campaign is for — nobody answered, so nothing below is measured against a goal.')
  if (!input.goal?.kpi?.trim()) unanswered.push('How success is measured (goal KPI) — without one, "how did it go" has no answer this report can check.')
  if (!audiences.length) unanswered.push('Who it targets — no asset carries an audience, so none of this can be read by who it reached.')
  if (!(input.proofPoints ?? []).length) unanswered.push('What backs its claims — no proof points, so no claim here is traceable to evidence.')

  // ---- What shipped: the one section owed to nothing but the rows ----
  const byStage: StageShipped[] = FUNNEL_STAGES.map(({ stage, label }) => ({
    stage,
    label,
    assets: rows.filter((r) => (r.funnelStage ?? funnelStageFor(r.channel, r.assetType)) === stage).length,
  })).filter((s) => s.assets > 0)

  const channelIds = [...new Set(rows.map((r) => r.channel))]
  const byChannel: ChannelShipped[] = channelIds
    .map((channel) => ({
      channel,
      label: CHANNELS[channel]?.label ?? String(channel),
      assets: rows.filter((r) => r.channel === channel).length,
    }))
    .sort((a, b) => b.assets - a.assets || a.label.localeCompare(b.label))

  // A journey is lines drawn AND lines that owe a control at the near end. The gaps are the finding.
  const links = rows.filter((r) => (r.linksTo ?? '').trim()).length
  const gaps = suggestions.filter((s) => s.kind === 'uncovered-handoff' || s.kind === 'dangling-cta').length
  const unfinished = suggestions.filter((s) => s.kind === 'unfinished-asset').length

  // ---- What actually happened, and nothing else ----
  const measuredRows = rows.map((r) => measuredOf(r)).filter((m) => m.measured)
  const measured = {
    assets: measuredRows.length,
    impressions: measuredRows.reduce((a, m) => a + m.impressions, 0),
    engagement: measuredRows.reduce((a, m) => a + m.engagement, 0),
    source: (measuredRows.length ? 'channel' : 'none') as 'channel' | 'none',
  }

  /**
   * ---- Money, withheld rather than zeroed ----
   *
   * With no CRM attached, every revenue figure available here comes from the sample adapter. The
   * alternative to withholding is a labelled zero, and a zero in a money column is read as a
   * result no matter what the label beside it says — the better the client's data, the emptier and
   * more damning their report would look. Saying the section is not available, and why, is the only
   * version of this that cannot be misread.
   */
  const spend = rows.reduce((a, r) => a + (r.spend?.toDate ?? 0), 0)
  let money: MoneySection
  if (input.attributionIsSample) {
    money = {
      shown: false,
      reason:
        'No CRM is connected, so revenue, pipeline and leads are not reported. The figures available without one come from sample data, ' +
        'and a sample number in a money column reads as a result. Connect a CRM to report on money.',
    }
  } else if (!input.attribution) {
    // A CRM being attached is not the same as figures having arrived, and the gap between those two
    // is exactly where a zero would get written and then read as "we earned nothing".
    money = {
      shown: false,
      reason: 'A CRM is connected but no attribution figures were supplied for this campaign, so money is not reported rather than reported as zero.',
    }
  } else {
    const { revenue, pipeline, leads } = input.attribution
    money = {
      shown: true,
      crm: input.crm?.trim() || 'the connected CRM',
      revenue,
      pipeline,
      leads,
      spend,
      // A partial denominator is a WRONG number, not an incomplete one: with spend on some channels
      // and not others, a blended ROAS flatters whatever was left out. No spend, no ratio.
      roas: spend > 0 ? revenue / spend : null,
    }
  }

  // ---- Which proof earned the attention ----
  const proofAssets = new Map<string, number>()
  const proofEngagement = new Map<string, number>()
  for (const r of rows) {
    const { engagement } = measuredOf(r)
    for (const id of assetRtbIds(r)) {
      proofAssets.set(id, (proofAssets.get(id) ?? 0) + 1)
      proofEngagement.set(id, (proofEngagement.get(id) ?? 0) + engagement)
    }
  }
  const labelOf = new Map((input.proofPoints ?? []).map((p) => [p.id, p.label]))
  const proofPerformance: ProofPerformance[] = [...proofAssets.entries()]
    .map(([id, assets]) => ({
      id,
      label: labelOf.get(id) ?? id,
      assets,
      engagement: proofEngagement.get(id) ?? 0,
      // Ranked on measured attention, never on money — see `money` above.
      basis: 'engagement' as const,
    }))
    .sort((a, b) => b.engagement - a.engagement || b.assets - a.assets || a.label.localeCompare(b.label))

  /**
   * ---- Planned vs actual ----
   *
   * IMPORTED POSTS ARE EXCLUDED, and the exclusion is the honest part. Import writes
   * `scheduledAt: publishedAt || now`, so an imported post's intent EQUALS its fact by construction
   * and would report a perfect zero slip. Counting them would mean the assets that came from the
   * real world always look punctual while the ones you planned here carry all the slip — the
   * opposite of the truth. Only assets whose two dates were set independently are compared.
   */
  const comparable = rows.filter((r) => {
    if (r.source === 'social-live' || r.source === 'imported' || r.source === 'site') return false
    const planned = Date.parse(r.scheduledAt ?? '')
    const actual = Date.parse(r.publishedAt ?? '')
    return Number.isFinite(planned) && Number.isFinite(actual)
  })
  const lateEach = comparable.map((r) => daysLate(Date.parse(r.scheduledAt), Date.parse(r.publishedAt!)))
  const timing = {
    compared: comparable.length,
    onTime: lateEach.filter((d) => d === 0).length,
    lateDays: lateEach.reduce((a, d) => a + d, 0),
    note: comparable.length
      ? null
      : 'Nothing to compare yet: no asset planned in Breadcrumbs has a published date, so there is no slip to report.',
  }

  return {
    brand: input.brand?.trim() || null,
    campaign: input.campaign,
    promise: {
      motion: input.strategy?.trim() || null,
      goal: input.goal && (input.goal.message || input.goal.kpi || input.goal.target != null) ? input.goal : null,
      audiences,
      proofPoints: input.proofPoints ?? [],
      unanswered,
    },
    shipped: {
      total: rows.length,
      live: rows.filter((r) => r.status === 'posted').length,
      byStage,
      byChannel,
      journey: { links, gaps },
      unfinished,
    },
    measured,
    money,
    proofPerformance,
    timing,
    changes: suggestions.slice(0, 10),
  }
}
