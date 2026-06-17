import type { TrafficRow } from './types'
import { messagingAllText } from './messaging'

/** A Reason to Believe — a proof point that substantiates the campaign's promise. */
export interface Rtb {
  id: string
  label: string
  detail: string
}

/**
 * Authored RTB sets per campaign, grounded in the ICP / brand truth. Assets map
 * onto these. (Auto-deriving RTBs from asset content is a later enhancement.)
 */
export const CAMPAIGN_RTBS: Record<string, Rtb[]> = {
  'Spring Launch 2026': [
    { id: 'speed', label: '2x faster builds', detail: 'Benchmark: builds complete in half the time vs the prior release.' },
    { id: 'rollback', label: 'One-click rollback', detail: 'Revert any deploy in one click — ship without fear.' },
    { id: 'redesign', label: 'Redesigned dashboard', detail: 'New dashboard cut time-to-insight in user testing.' },
  ],
  'Q2 Demand Gen': [
    { id: 'acme', label: 'Acme cut ops time 40%', detail: 'Case study: Acme reduced manual ops work 40% in 90 days.' },
    { id: 'integrations', label: '200+ integrations', detail: 'Connects to the tools mid-market ops teams already run.' },
    { id: 'ttv', label: 'Live in a week', detail: 'Median time-to-value is 7 days.' },
  ],
  'Webinar: Scaling Ops': [
    { id: 'panel', label: 'Ops leaders on the panel', detail: 'Speakers are VPs of Ops from Series B+ SaaS companies.' },
    { id: 'playbook', label: 'Takeaway playbook', detail: 'Every attendee gets the scaling-ops playbook.' },
  ],
}

export const rtbsForCampaign = (campaign?: string): Rtb[] => CAMPAIGN_RTBS[campaign ?? ''] ?? []

export const rtbById = (campaign: string | undefined, id: string): Rtb | undefined =>
  rtbsForCampaign(campaign).find((r) => r.id === id)

/** All RTB ids an asset carries (union across its messaging components). */
export const assetRtbIds = (row: TrafficRow): string[] => [
  ...new Set(Object.values(row.rtbMap ?? {}).flat()),
]

const reviewable = (r: TrafficRow) => r.status !== 'posted' && r.status !== 'failed'

export interface RtbUse {
  campaign: string
  rtb: Rtb
  uses: number
}

export interface RtbCoverage {
  used: number
  total: number
  byRtb: RtbUse[]
  /** Authored RTBs not used by any asset — proof you have but aren't deploying. */
  gaps: RtbUse[]
  /** A single RTB carrying most of a campaign's proof. */
  overReliance: { campaign: string; rtb: Rtb; share: number } | null
  /** Assets with messaging (a claim) but no RTB mapped — unsupported claims. */
  unsupported: TrafficRow[]
}

export function rtbCoverage(rows: TrafficRow[]): RtbCoverage {
  const batch = rows.filter(reviewable)
  const campaigns = [...new Set(batch.map((r) => r.campaign).filter(Boolean))] as string[]
  const byRtb: RtbUse[] = []
  const perCampaignTotal: Record<string, number> = {}

  for (const campaign of campaigns) {
    const camRows = batch.filter((r) => r.campaign === campaign)
    for (const rtb of rtbsForCampaign(campaign)) {
      const uses = camRows.filter((r) => assetRtbIds(r).includes(rtb.id)).length
      byRtb.push({ campaign, rtb, uses })
      perCampaignTotal[campaign] = (perCampaignTotal[campaign] ?? 0) + uses
    }
  }

  let overReliance: RtbCoverage['overReliance'] = null
  for (const u of byRtb) {
    const camTotal = perCampaignTotal[u.campaign] ?? 0
    if (camTotal >= 3 && u.uses / camTotal > 0.6) {
      overReliance = { campaign: u.campaign, rtb: u.rtb, share: u.uses / camTotal }
      break
    }
  }

  return {
    total: byRtb.length,
    used: byRtb.filter((u) => u.uses > 0).length,
    byRtb,
    gaps: byRtb.filter((u) => u.uses === 0),
    overReliance,
    unsupported: batch.filter((r) => messagingAllText(r).trim() && assetRtbIds(r).length === 0),
  }
}
