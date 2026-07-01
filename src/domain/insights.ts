import { mockAttio } from '../adapters/attio/mockAttio'
import type { Comment } from '../adapters/comments/mockComments'
import { CHANNELS } from './channels'
import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from './funnel'
import { assetRtbIds, rtbById, rtbsForCampaign } from './rtb'
import type { ChannelId, TrafficRow } from './types'

export interface Kpis {
  revenue: number
  pipeline: number
  leads: number
  spend: number
  roas: number | null
  rows: number
  posted: number
  /** Real engagement (likes + comments) pulled from the channel. */
  engagement: number
}
export interface RtbRoi {
  campaign: string
  id: string
  label: string
  revenue: number
  assets: number
  engagement: number
}
export interface StageRoi {
  stage: FunnelStage
  label: string
  hint: string
  assets: number
  revenue: number
  leads: number
  spend: number
  engagement: number
}
export interface ChannelRoi {
  channel: ChannelId
  label: string
  assets: number
  revenue: number
  leads: number
  spend: number
  engagement: number
}
export interface IcpPerf {
  hasReview: boolean
  onIcp: { assets: number; revenue: number; leads: number }
  flagged: { assets: number; revenue: number; leads: number }
}
export interface Engagement {
  synced: boolean
  total: number
  intent: number
  needsReply: number
  routed: number
}
export interface Insights {
  kpis: Kpis
  rtbRoi: RtbRoi[]
  stages: StageRoi[]
  channels: ChannelRoi[]
  icp: IcpPerf
  engagement: Engagement
}

interface Opts {
  comments: Record<string, Comment[]>
  flaggedRowIds: Set<string>
  hasReview: boolean
}

/** Sum won revenue / leads over a set of distinct asset names (no double count). */
function rollup(assetNames: Set<string>): { revenue: number; leads: number } {
  let revenue = 0
  let leads = 0
  for (const name of assetNames) {
    const a = mockAttio.attributionForAsset(name)
    revenue += a.wonRevenue
    leads += a.leads
  }
  return { revenue, leads }
}

const rowSpend = (r: TrafficRow): number => r.spend?.toDate ?? 0
const rowEng = (r: TrafficRow): number => (r.engagement ? r.engagement.likes + r.engagement.comments : 0)

/** Compute the full insights rollup from a scoped set of rows. */
export function computeInsights(rows: TrafficRow[], opts: Opts): Insights {
  const assetNames = new Set(rows.map((r) => r.assetName))
  const totals = rollup(assetNames)
  const spend = rows.reduce((a, r) => a + rowSpend(r), 0)

  // Open pipeline value for in-scope assets.
  const pipeline = mockAttio
    .listDeals()
    .filter((d) => d.stage === 'open' && !!d.sourceAsset && assetNames.has(d.sourceAsset))
    .reduce((a, d) => a + d.amount, 0)

  const kpis: Kpis = {
    revenue: totals.revenue,
    pipeline,
    leads: totals.leads,
    spend,
    roas: spend > 0 ? totals.revenue / spend : null,
    rows: rows.length,
    posted: rows.filter((r) => r.status === 'posted').length,
    engagement: rows.reduce((a, r) => a + rowEng(r), 0),
  }

  // ---- Proof-point ROI: revenue credited to each RTB the asset carries ----
  const rtbSets = new Map<string, Set<string>>()
  const rtbInfo = new Map<string, { campaign: string; id: string; label: string }>()
  const scopedCampaigns = new Set(rows.map((r) => (r.campaign ?? '').trim()).filter(Boolean))
  for (const camp of scopedCampaigns) {
    for (const rtb of rtbsForCampaign(camp)) {
      const key = `${camp}::${rtb.id}`
      rtbSets.set(key, new Set())
      rtbInfo.set(key, { campaign: camp, id: rtb.id, label: rtb.label })
    }
  }
  const rtbEng = new Map<string, number>()
  for (const r of rows) {
    const camp = (r.campaign ?? '').trim()
    for (const id of assetRtbIds(r)) {
      const key = `${camp}::${id}`
      if (!rtbSets.has(key)) {
        rtbSets.set(key, new Set())
        rtbInfo.set(key, { campaign: camp, id, label: rtbById(camp, id)?.label ?? id })
      }
      rtbSets.get(key)!.add(r.assetName)
      rtbEng.set(key, (rtbEng.get(key) ?? 0) + rowEng(r))
    }
  }
  const rtbRoi: RtbRoi[] = [...rtbSets.entries()]
    .map(([key, names]) => {
      const info = rtbInfo.get(key)!
      return { ...info, revenue: rollup(names).revenue, assets: names.size, engagement: rtbEng.get(key) ?? 0 }
    })
    .sort((a, b) => b.revenue - a.revenue || b.engagement - a.engagement)

  // ---- Funnel coverage vs outcome ----
  const stages: StageRoi[] = FUNNEL_STAGES.map(({ stage, label, hint }) => {
    const stageRows = rows.filter((r) => funnelStageFor(r.channel, r.assetType) === stage)
    const names = new Set(stageRows.map((r) => r.assetName))
    const { revenue, leads } = rollup(names)
    return {
      stage,
      label,
      hint,
      assets: names.size,
      revenue,
      leads,
      spend: stageRows.reduce((a, r) => a + rowSpend(r), 0),
      engagement: stageRows.reduce((a, r) => a + rowEng(r), 0),
    }
  })

  // ---- Channel performance ----
  const channelIds = [...new Set(rows.map((r) => r.channel))]
  const channels: ChannelRoi[] = channelIds
    .map((channel) => {
      const chRows = rows.filter((r) => r.channel === channel)
      const names = new Set(chRows.map((r) => r.assetName))
      const { revenue, leads } = rollup(names)
      return {
        channel,
        label: CHANNELS[channel].label,
        assets: names.size,
        revenue,
        leads,
        spend: chRows.reduce((a, r) => a + rowSpend(r), 0),
        engagement: chRows.reduce((a, r) => a + rowEng(r), 0),
      }
    })
    .sort((a, b) => b.revenue - a.revenue || b.engagement - a.engagement || b.leads - a.leads)

  // ---- ICP alignment vs outcome ----
  const flaggedNames = new Set<string>()
  const onIcpNames = new Set<string>()
  for (const r of rows) {
    ;(opts.flaggedRowIds.has(r.id) ? flaggedNames : onIcpNames).add(r.assetName)
  }
  // An asset flagged on any row counts as flagged (not on-ICP).
  for (const n of flaggedNames) onIcpNames.delete(n)
  const onIcp = rollup(onIcpNames)
  const flagged = rollup(flaggedNames)
  const icp: IcpPerf = {
    hasReview: opts.hasReview,
    onIcp: { assets: onIcpNames.size, ...onIcp },
    flagged: { assets: flaggedNames.size, ...flagged },
  }

  // ---- Engagement ----
  const scopedIds = new Set(rows.map((r) => r.id))
  const cs = Object.entries(opts.comments)
    .filter(([id]) => scopedIds.has(id))
    .flatMap(([, list]) => list)
  const engagement: Engagement = {
    synced: Object.keys(opts.comments).length > 0,
    total: cs.length,
    intent: cs.filter((c) => c.intent).length,
    needsReply: cs.filter((c) => c.needsResponse).length,
    routed: cs.filter((c) => c.routed).length,
  }

  return { kpis, rtbRoi, stages, channels, icp, engagement }
}
