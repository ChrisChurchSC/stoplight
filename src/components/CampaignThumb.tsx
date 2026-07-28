import { FUNNEL_STAGES, funnelStageFor } from '../domain/funnel'
import type { TrafficRow } from '../domain/types'

/**
 * A campaign's thumbnail: a mini preview of its journey laid over the funnel
 * bands. Each campaign reads as its own shape — a forking tree fans out, a flat
 * plan scatters by stage — so the campaign list looks like a gallery of projects.
 * Structural only (no copy), derived from the same branch links the canvas uses.
 */

const W = 260
const H = 132
const PAD = 14
const STAGES = FUNNEL_STAGES.length

export function CampaignThumb({ rows }: { rows: TrafficRow[] }) {
  if (!rows.length) {
    return (
      <div className="camp-thumb-empty">
        <span>No assets yet</span>
      </div>
    )
  }

  const byName = new Map<string, TrafficRow>()
  for (const r of rows) if (!byName.has(r.assetName)) byName.set(r.assetName, r)
  const parentName = (r: TrafficRow) =>
    r.branchOf && byName.has(r.branchOf) && r.branchOf !== r.assetName ? r.branchOf : null

  const childrenOf = new Map<string, TrafficRow[]>()
  const roots: TrafficRow[] = []
  for (const r of rows) {
    const p = parentName(r)
    if (p) (childrenOf.get(p) ?? childrenOf.set(p, []).get(p)!).push(r)
    else roots.push(r)
  }
  const stageIdx = (r: TrafficRow) =>
    Math.max(0, FUNNEL_STAGES.findIndex((s) => s.stage === funnelStageFor(r.channel, r.assetType)))
  const ord = (a: TrafficRow, b: TrafficRow) =>
    stageIdx(a) - stageIdx(b) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.assetName.localeCompare(b.assetName)

  roots.sort(ord)
  let leaf = 0
  const laneOf = new Map<string, number>()
  // Break any branchOf cycle: if we re-enter a node mid-recursion, treat it as a
  // leaf rather than recursing forever (a cycle would otherwise hang the render).
  const assigning = new Set<string>()
  const assign = (r: TrafficRow): number => {
    if (assigning.has(r.id)) {
      const l = leaf
      leaf += 1
      laneOf.set(r.id, l)
      return l
    }
    assigning.add(r.id)
    const kids = (childrenOf.get(r.assetName) ?? []).slice().sort(ord)
    let lane: number
    if (!kids.length) {
      lane = leaf
      leaf += 1
    } else {
      const ls = kids.map(assign)
      lane = ls.reduce((s, x) => s + x, 0) / ls.length
    }
    laneOf.set(r.id, lane)
    assigning.delete(r.id)
    return lane
  }
  for (const r of roots) assign(r)
  const lanes = Math.max(1, leaf)

  const innerW = W - PAD * 2
  const innerH = H - PAD * 2
  const xOf = (lane: number) => (lanes === 1 ? W / 2 : PAD + (lane / (lanes - 1)) * innerW)
  const yOf = (st: number) => PAD + ((st + 0.5) / STAGES) * innerH
  const pos = new Map<string, { x: number; y: number }>()
  for (const r of rows) pos.set(r.id, { x: xOf(laneOf.get(r.id) ?? 0), y: yOf(stageIdx(r)) })

  const edges = rows
    .map((r) => {
      const pn = parentName(r)
      const from = pn ? pos.get(byName.get(pn)!.id) : null
      const to = pos.get(r.id)
      return from && to ? { from, to } : null
    })
    .filter((e): e is { from: { x: number; y: number }; to: { x: number; y: number } } => !!e)

  return (
    <svg className="camp-thumb" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {FUNNEL_STAGES.map((s, i) => (
        <rect key={s.stage} x={0} y={(i / STAGES) * H} width={W} height={H / STAGES} className={`ct-band${i % 2 ? ' alt' : ''}`} />
      ))}
      {edges.map((e, i) => {
        const my = (e.from.y + e.to.y) / 2
        return <path key={i} d={`M ${e.from.x} ${e.from.y} C ${e.from.x} ${my}, ${e.to.x} ${my}, ${e.to.x} ${e.to.y}`} className="ct-edge" />
      })}
      {rows.map((r) => {
        const p = pos.get(r.id)!
        const isRoot = !parentName(r)
        return <circle key={r.id} cx={p.x} cy={p.y} r={isRoot ? 5.5 : 4} className={`ct-node${isRoot ? ' root' : ''}`} />
      })}
    </svg>
  )
}
