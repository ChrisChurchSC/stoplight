import type { Comment } from '../adapters/comments/mockComments'
import { flagResolved } from '../adapters/icp/mockIcp'
import type { BatchReview, Icp } from '../adapters/icp/types'
import { applyBreakStatus, AXIS_META, detectBreaks, threadHealth, type BreakAxis, type BreakStatus } from './breaks'
import { money } from './budget'
import type { Campaign } from './clients'
import { computeInsights } from './insights'
import type { TrafficRow } from './types'

/**
 * "Ask Claude" — the conversational layer over the two things this tool knows
 * that nothing else does: whether a campaign is coherent (the connection check)
 * and what's actually driving outcomes (proof-point ROI). A question is routed to
 * one of a few BOUNDED functions; the app computes the facts deterministically and
 * Claude only classifies + narrates them, so every number is real and the
 * heuristic fallback answers the same questions with the same data, key or not.
 */

export type AskIntent = 'connection' | 'what-worked' | 'help'

export interface AskContext {
  question: string
  scope: string
  connection: {
    total: number
    connected: number
    breaks: number
    byAxis: { axis: BreakAxis; label: string; count: number }[]
    items: { headline: string; axis: BreakAxis }[]
  }
  performance: {
    revenue: number
    roas: number | null
    leads: number
    posted: number
    rows: number
    topRtb: { label: string; revenue: number } | null
    topChannel: { label: string; revenue: number } | null
    topStage: { label: string; revenue: number } | null
    icp: { onIcpRevenue: number; flaggedRevenue: number; flaggedAssets: number; hasReview: boolean }
  }
}

export interface AskAnswer {
  intent: AskIntent
  answer: string
}

interface BuildOpts {
  scope: string
  breakStatus: Record<string, BreakStatus>
  comments: Record<string, Comment[]>
  batchReview: BatchReview | null
  icp: Icp | null
  campaigns: Campaign[]
}

/** Gather the real, deterministic findings a question might need. Both the live
 *  (Claude) and offline (heuristic) paths answer from exactly this. */
export function buildAskContext(question: string, rows: TrafficRow[], opts: BuildOpts): AskContext {
  const all = applyBreakStatus(detectBreaks(rows), opts.breakStatus)
  const open = all.filter((b) => b.status === 'open')
  const assetNames = new Set(rows.map((r) => r.assetName))
  const health = threadHealth(assetNames, all)

  const axisCounts = new Map<BreakAxis, number>()
  for (const b of open) axisCounts.set(b.axis, (axisCounts.get(b.axis) ?? 0) + 1)
  const byAxis = [...axisCounts.entries()]
    .map(([axis, count]) => ({ axis, label: AXIS_META[axis].label, count }))
    .sort((a, b) => b.count - a.count)
  const items = open.slice(0, 6).map((b) => ({ headline: b.headline, axis: b.axis }))

  const pains = opts.icp?.pains ?? []
  const flaggedRowIds = new Set(
    (opts.batchReview?.flags ?? [])
      .filter((fl) => {
        const row = rows.find((r) => r.id === fl.rowId)
        return row ? !flagResolved(fl, row, pains) : false
      })
      .map((fl) => fl.rowId),
  )
  const ins = computeInsights(rows, { comments: opts.comments, flaggedRowIds, hasReview: !!opts.batchReview })
  const topRtb = ins.rtbRoi.find((r) => r.revenue > 0) ?? null
  const topChannel = ins.channels.find((c) => c.revenue > 0) ?? null
  const topStage = [...ins.stages].sort((a, b) => b.revenue - a.revenue).find((s) => s.revenue > 0) ?? null

  return {
    question,
    scope: opts.scope,
    connection: {
      total: assetNames.size,
      connected: health.connected,
      breaks: open.length,
      byAxis,
      items,
    },
    performance: {
      revenue: ins.kpis.revenue,
      roas: ins.kpis.roas,
      leads: ins.kpis.leads,
      posted: ins.kpis.posted,
      rows: ins.kpis.rows,
      topRtb: topRtb ? { label: topRtb.label, revenue: topRtb.revenue } : null,
      topChannel: topChannel ? { label: topChannel.label, revenue: topChannel.revenue } : null,
      topStage: topStage ? { label: topStage.label, revenue: topStage.revenue } : null,
      icp: {
        onIcpRevenue: ins.icp.onIcp.revenue,
        flaggedRevenue: ins.icp.flagged.revenue,
        flaggedAssets: ins.icp.flagged.assets,
        hasReview: ins.icp.hasReview,
      },
    },
  }
}

const CONNECTION_HINTS = [
  'coheren', 'connect', 'break', 'contradic', 'flag', 'off-brand', 'off brand', 'voice',
  'proof', 'thread', 'consistent', 'align', 'mismatch', 'story', 'on brand', 'on-brand', 'publish',
]
const PERF_HINTS = [
  'work', 'perform', 'best', 'top', 'roas', 'roi', 'revenue', 'win', 'driv', 'result',
  'convert', 'spend', 'return', 'effective', 'money', 'sales', 'pipeline',
]

/** Keyword routing for the offline path (and a sane default for the live one). */
export function classify(question: string): AskIntent {
  const q = question.toLowerCase()
  const conn = CONNECTION_HINTS.some((h) => q.includes(h))
  const perf = PERF_HINTS.some((h) => q.includes(h))
  if (perf && !conn) return 'what-worked'
  if (conn) return 'connection'
  return 'help'
}

/** Templated answer from the real findings — what runs when there's no API key. */
export function heuristicAnswer(ctx: AskContext): AskAnswer {
  const intent = classify(ctx.question)

  if (intent === 'connection') {
    const c = ctx.connection
    if (c.breaks === 0) {
      return {
        intent,
        answer: `All ${c.total} assets connect: every one tells a single story with no open breaks. You're clear to publish on the connection check.`,
      }
    }
    // Lowercase only the first letter so acronyms like CTA stay uppercase.
    const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
    const axisBits = c.byAxis.map((a) => `${a.count} ${lc(a.label)}`).join(', ')
    const lead = c.items[0]?.headline
    return {
      intent,
      answer: `${c.connected} of ${c.total} assets connect. The thread snaps in ${c.breaks} place${c.breaks === 1 ? '' : 's'} (${axisBits}).${lead ? ` The sharpest: ${lead}` : ''} Resolve these to publish.`,
    }
  }

  if (intent === 'what-worked') {
    const p = ctx.performance
    if (p.posted === 0) {
      return {
        intent,
        answer: `Nothing's posted yet, so there's no attributed revenue to read. Publish assets and I'll show which proof points, channels, and stages are driving outcomes.`,
      }
    }
    const bits: string[] = []
    if (p.topRtb) bits.push(`the proof point "${p.topRtb.label}" is driving the most revenue (${money(p.topRtb.revenue)})`)
    if (p.topChannel) bits.push(`${p.topChannel.label} is the top channel (${money(p.topChannel.revenue)})`)
    if (p.topStage) bits.push(`${p.topStage.label} is the strongest stage`)
    const detail = bits.length ? bits.join('; ') + '.' : ''
    const detailCap = detail ? ' ' + detail.charAt(0).toUpperCase() + detail.slice(1) : ''
    const icpBit =
      p.icp.hasReview && p.icp.flaggedAssets > 0
        ? ` Off-ICP assets are leaking ${money(p.icp.flaggedRevenue)} you could recover by tightening them.`
        : ''
    return {
      intent,
      answer: `${money(p.revenue)} attributed across ${p.posted} posted asset${p.posted === 1 ? '' : 's'}${
        p.roas != null ? ` at ${p.roas.toFixed(1)}x ROAS` : ''
      }.${detailCap}${icpBit}`.trim(),
    }
  }

  return {
    intent: 'help',
    answer: `I can read this campaign two ways. Ask "is this coherent?" to run the connection check: what contradicts, what's unproven, what's off-brand. Or ask "what's working?" to see which proof points, channels, and stages are driving revenue.`,
  }
}
