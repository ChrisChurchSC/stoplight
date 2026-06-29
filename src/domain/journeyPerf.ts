import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from './funnel'
import type { ChannelId, TrafficRow } from './types'

/**
 * Performance on a branching journey. A campaign laid out as a tree has two kinds
 * of performance: per-asset (how many it reached, how hard it worked) and the FLOW
 * through each fork — how many people actually advanced from one step to the next.
 * The flow is where a journey leaks: a strong card that hands almost no one forward
 * is the leak, even if its own numbers look fine.
 *
 * Mock-first and deterministic: reach decays down the funnel from a per-channel base,
 * and each fork carries a stage-appropriate advance rate with a stable per-asset
 * jitter (so the numbers hold still across renders). Swap this module's body for real
 * platform + attribution pulls later; the shape the canvas reads stays the same.
 */

export interface AssetPerf {
  /** People who saw this asset. */
  reach: number
  /** People who advanced from it (sum of its forks, or a final action for a leaf). */
  advanced: number
  /** advanced / reach. */
  rate: number
  /** What `rate` measures here ("advance" mid-journey, "complete" at the end). */
  rateLabel: string
}

export interface StagePerf {
  stage: FunnelStage
  label: string
  reach: number
  assets: number
}

export interface JourneyPerf {
  /** Per asset, keyed by row id. */
  perAsset: Map<string, AssetPerf>
  /** Per fork, keyed by the CHILD row id → fraction of the parent's reach that
   *  advanced into it (the handoff conversion). */
  edgeFlow: Map<string, number>
  plan: {
    /** Total reach at the top of the funnel (sum of entry assets). */
    topReach: number
    /** Reach landing on a conversion-stage asset. */
    toConversion: number
    /** Reach landing on a retention-stage asset (completed the journey). */
    completed: number
    /** toConversion / topReach. */
    convRate: number
    byStage: StagePerf[]
    /** The entry→leaf path that carries the most people to its end. */
    bestPath: { id: string; name: string }[]
    /** The weakest fork (lowest flow) — where the journey leaks most. */
    weakestFork: { childId: string; name: string; flow: number } | null
  }
}

// Per-channel base reach for an entry asset (mock potential audience by channel).
const CHANNEL_REACH: Partial<Record<ChannelId, number>> = {
  instagram: 92_000,
  tiktok: 140_000,
  youtube: 78_000,
  facebook: 64_000,
  linkedin: 41_000,
  x: 55_000,
  blog: 22_000,
  'meta-ads': 120_000,
  'tiktok-ads': 160_000,
  'youtube-ads': 110_000,
  'linkedin-ads': 38_000,
  'google-search': 30_000,
  'landing-page': 26_000,
  email: 48_000,
  sms: 36_000,
  push: 30_000,
}
const DEFAULT_REACH = 50_000

// Stable jitter in [0.8, 1.2] from an asset id, so numbers don't flicker per render.
function jitter(seed: string): number {
  let x = 2166136261
  for (let i = 0; i < seed.length; i++) {
    x ^= seed.charCodeAt(i)
    x = Math.imul(x, 16777619)
  }
  return 0.8 + ((x >>> 0) % 41) / 100
}

const stageIdx = (r: TrafficRow): number =>
  Math.max(0, FUNNEL_STAGES.findIndex((s) => s.stage === funnelStageFor(r.channel, r.assetType)))

// Advance rate for a fork by how far it moves down the funnel.
function forkRate(fromStage: number, toStage: number): number {
  if (toStage === fromStage) return 0.55 // a same-stage variant shares most of the audience
  if (toStage === fromStage + 1) return [0.09, 0.22, 0.4][fromStage] ?? 0.15 // one step down
  if (toStage > fromStage) return 0.12 // skipped a stage
  return 0.3 // looped back
}

// A leaf's final-action rate (it has no fork to carry people on).
const LEAF_ACTION = [0.03, 0.06, 0.14, 0.28] // by stage index

export function journeyPerformance(rows: TrafficRow[]): JourneyPerf {
  const perAsset = new Map<string, AssetPerf>()
  const edgeFlow = new Map<string, number>()
  const byName = new Map<string, TrafficRow>()
  for (const r of rows) if (!byName.has(r.assetName)) byName.set(r.assetName, r)
  const parentOf = (r: TrafficRow) =>
    r.branchOf && byName.has(r.branchOf) && r.branchOf !== r.assetName ? byName.get(r.branchOf)! : null
  const childrenOf = new Map<string, TrafficRow[]>()
  const roots: TrafficRow[] = []
  for (const r of rows) {
    const p = parentOf(r)
    if (p) (childrenOf.get(p.assetName) ?? childrenOf.set(p.assetName, []).get(p.assetName)!).push(r)
    else roots.push(r)
  }

  // Reach flows down the tree from each entry. (Iterative DFS; ignores any cycle.)
  const reachOf = new Map<string, number>()
  const seen = new Set<string>()
  const walk = (r: TrafficRow, reach: number) => {
    if (seen.has(r.id)) return
    seen.add(r.id)
    reachOf.set(r.id, reach)
    for (const c of childrenOf.get(r.assetName) ?? []) {
      const rate = forkRate(stageIdx(r), stageIdx(c)) * jitter(c.id)
      const childReach = Math.max(1, Math.round(reach * rate))
      edgeFlow.set(c.id, rate)
      walk(c, childReach)
    }
  }
  for (const r of roots) walk(r, Math.round((CHANNEL_REACH[r.channel] ?? DEFAULT_REACH) * jitter(r.id)))

  for (const r of rows) {
    const reach = reachOf.get(r.id) ?? 0
    const kids = childrenOf.get(r.assetName) ?? []
    let advanced: number
    let rateLabel: string
    if (kids.length) {
      advanced = kids.reduce((a, c) => a + (reachOf.get(c.id) ?? 0), 0)
      rateLabel = 'advance'
    } else {
      advanced = Math.round(reach * (LEAF_ACTION[stageIdx(r)] ?? 0.05) * jitter(`${r.id}leaf`))
      rateLabel = stageIdx(r) >= 3 ? 'complete' : 'act'
    }
    perAsset.set(r.id, { reach, advanced, rate: reach ? advanced / reach : 0, rateLabel })
  }

  // Roll up by funnel stage.
  const byStage: StagePerf[] = FUNNEL_STAGES.map((s, i) => {
    const at = rows.filter((r) => stageIdx(r) === i)
    return { stage: s.stage, label: s.label, reach: at.reduce((a, r) => a + (reachOf.get(r.id) ?? 0), 0), assets: at.length }
  })
  const topReach = rows.filter((r) => !parentOf(r)).reduce((a, r) => a + (reachOf.get(r.id) ?? 0), 0)
  const toConversion = byStage[2]?.reach ?? 0
  const completed = byStage[3]?.reach ?? 0

  // Best path: the chain that carries the most people all the way to the deepest
  // stage the journey reaches (a complete journey beats a shallow dead-end).
  const leaves = rows.filter((r) => !(childrenOf.get(r.assetName) ?? []).length)
  const deepest = leaves.reduce((m, r) => Math.max(m, stageIdx(r)), 0)
  let bestEnd: TrafficRow | null = null
  let bestEndReach = -1
  for (const r of leaves) {
    if (stageIdx(r) < deepest) continue // only the leaves that complete the journey
    const reach = reachOf.get(r.id) ?? 0
    if (reach > bestEndReach) {
      bestEndReach = reach
      bestEnd = r
    }
  }
  const bestPath: { id: string; name: string }[] = []
  for (let cur = bestEnd; cur; cur = parentOf(cur)) bestPath.unshift({ id: cur.id, name: cur.assetName })

  // Weakest fork: the lowest-flow handoff (where the journey leaks most).
  let weakestFork: JourneyPerf['plan']['weakestFork'] = null
  for (const [childId, flow] of edgeFlow) {
    const r = rows.find((x) => x.id === childId)
    if (!r) continue
    if (!weakestFork || flow < weakestFork.flow) weakestFork = { childId, name: r.assetName, flow }
  }

  return {
    perAsset,
    edgeFlow,
    plan: { topReach, toConversion, completed, convRate: topReach ? toConversion / topReach : 0, byStage, bestPath, weakestFork },
  }
}

/** Compact metric formatting: 1.2k, 3.4M. */
export function formatReach(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return `${n}`
}
