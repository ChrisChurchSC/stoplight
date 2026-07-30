import { MAX_OBJECT_DEPTH, type SmartObject } from './smartObject'
import { REF_TYPE_FOR_OBJECT_KIND, type CanvasObject, type FlowBoard } from './flowBoard'
import type { FlowReference } from './clients'

/**
 * WHAT A WIRE CARRIES: resolving the board's graph into per-target instructions.
 *
 * An arrow from card A to card B means "A helps write B": everything A instructs travels with B to
 * every output B is wired to. So the instructions an asset is written under are the ones on every
 * card UPSTREAM of it, however many hops back.
 *
 * Pure and React-free on purpose. This decides what the copy model is told, which makes it the one
 * piece of the canvas that is worth being able to test against a hand-built board rather than by
 * dragging things around.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it resolves DIRECTION, not records. A card's records reach a
 * campaign only by a wire to the brief, and that stays a single hop (see attachToCampaign). The two
 * differ because they have different readers: direction has exactly one consumer, the copy writer,
 * so resolving it at draft time is cheap and reversible; records are read by the audience rotation,
 * the coherence check, fan-out and the Records rails, so a chain silently widening who an asset is
 * written to would be felt in places nobody was looking at.
 */

/** An instruction as it travels: the kind is carried so buildDirection can keep reading its shape. */
export interface ResolvedDirection {
  kind: string
  key: string
  value: string
}

/** The board's nodes that can carry direction, by id. A placement stands in for its members. */
function objectsById(board: FlowBoard): Map<string, CanvasObject[]> {
  const byId = new Map<string, CanvasObject[]>()
  const objects = new Map(board.objects.map((o) => [o.id, o]))
  for (const o of board.objects) byId.set(o.id, [o])
  // A smart object is one node on the board and several cards inside it. Wiring the object wires
  // everything in it, which is the whole reason to bundle cards in the first place.
  for (const p of board.placements) {
    byId.set(p.id, p.memberIds.map((m) => objects.get(m)).filter((o): o is CanvasObject => !!o))
  }
  return byId
}

/**
 * Every card that reaches `target` by following wires backwards, nearest first.
 *
 * Depth-capped and cycle-safe. The cap is MAX_OBJECT_DEPTH, shared with the smart-object contents
 * walk so there is one number to reason about rather than two that drift.
 */
export function upstreamObjects(board: FlowBoard, target: string, maxDepth = MAX_OBJECT_DEPTH): CanvasObject[] {
  const byId = objectsById(board)
  // Reverse adjacency: who points AT each node.
  const incoming = new Map<string, string[]>()
  for (const c of board.connectors) {
    const list = incoming.get(c.to)
    if (list) list.push(c.from)
    else incoming.set(c.to, [c.from])
  }
  const out: CanvasObject[] = []
  const seen = new Set<string>([target])
  let frontier = incoming.get(target) ?? []
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)
      for (const o of byId.get(id) ?? []) out.push(o)
      for (const up of incoming.get(id) ?? []) if (!seen.has(up)) next.push(up)
    }
    frontier = next
  }
  return out
}

/** The direction a set of cards contributes, flattened in the order given. */
export const directionOf = (objects: CanvasObject[]): ResolvedDirection[] =>
  objects.flatMap((o) => (o.direction ?? []).map((d) => ({ kind: o.kind as string, key: d.key, value: d.value })))

/** The instructions that reach one target, nearest card first. */
export const directionFor = (board: FlowBoard, target: string, maxDepth = MAX_OBJECT_DEPTH): ResolvedDirection[] =>
  directionOf(upstreamObjects(board, target, maxDepth))

/**
 * The whole board resolved in one pass: what reaches the campaign brief, and what reaches each
 * output that has anything wired to it.
 *
 * `campaign` applies to every asset, because a card wired to the brief is a statement about the
 * campaign. `byTarget` is the narrower set, and a caller puts it FIRST so a deliverable's own
 * instruction beats the campaign-wide one for the same key.
 */
export function resolveBoardDirection(
  board: FlowBoard,
  maxDepth = MAX_OBJECT_DEPTH,
): { campaign: ResolvedDirection[]; byTarget: Map<string, ResolvedDirection[]> } {
  const campaign = directionFor(board, 'campaign', maxDepth)
  const byTarget = new Map<string, ResolvedDirection[]>()
  // Only the ids something actually points at: a board with no wires resolves to nothing and costs
  // one pass over the connectors.
  const targets = new Set(board.connectors.map((c) => c.to))
  targets.delete('campaign')
  for (const t of targets) {
    const entries = directionFor(board, t, maxDepth)
    if (entries.length) byTarget.set(t, entries)
  }
  return { campaign, byTarget }
}

/** Who each node points AT. Shared by the two forward walks so they cannot disagree. */
function forwardEdges(board: FlowBoard): Map<string, string[]> {
  const outgoing = new Map<string, string[]>()
  for (const c of board.connectors) {
    const list = outgoing.get(c.from)
    if (list) { if (!list.includes(c.to)) list.push(c.to) } else outgoing.set(c.from, [c.to])
  }
  return outgoing
}

/**
 * What a card FEEDS: every output it reaches, following wires forwards.
 *
 * The mirror of upstreamObjects, and the thing two different questions both need — "what does this
 * card apply to" and "rewrite everything this card informs". Returns output ids (the brief, a
 * deliverable key, a post row id), never other cards: a card in the middle of a chain applies to
 * what the chain ends at, not to its neighbour.
 */
/**
 * The records wired DIRECTLY into `target` on this board, and nothing else.
 *
 * SINGLE HOP, for the reason in the header above: direction chains through the graph, records do
 * not. This is the one definition of "what is wired in", shared by the panel, deliverable
 * inheritance and the copy writer, so those three cannot drift apart again — they each used to
 * answer it differently, and the writer was still answering it from the campaign's stored
 * references long after the panel had stopped.
 *
 * Returns ids without labels. Labels live on the record slices, which this module deliberately does
 * not know about; every reader matches on id first and treats a label as a legacy fallback. A card
 * that names no record contributes nothing, which is what makes "wired but empty" distinguishable
 * from "wired and carrying something".
 */
export function wiredRefsFor(board: FlowBoard, smartObjects: SmartObject[], target: string): FlowReference[] {
  const byId = new Map(smartObjects.map((o) => [o.id, o]))
  const out: FlowReference[] = []
  const push = (r: FlowReference) => {
    if (!out.some((x) => x.type === r.type && x.id === r.id)) out.push(r)
  }
  for (const e of board.connectors) {
    if (e.to !== target) continue
    // A placed smart object contributes every record inside it; the library object is the truth.
    const placed = board.placements.find((p) => p.id === e.from)
    if (placed) {
      for (const r of byId.get(placed.smartObjectId)?.refs ?? []) push(r)
      continue
    }
    const obj = board.objects.find((o) => o.id === e.from)
    if (!obj) continue
    if (obj.smartObjectId) {
      for (const r of byId.get(obj.smartObjectId)?.refs ?? []) push(r)
      continue
    }
    const type = REF_TYPE_FOR_OBJECT_KIND[obj.kind]
    if (type && obj.refId) push({ type, id: obj.refId, label: '' })
  }
  return out
}

/**
 * Does this board connect anything to an OUTPUT? The gate on generating from nothing.
 *
 * An output is the brief, a deliverable or a post — anything that is not another card. So a
 * connector whose target is not itself a node on the board is one that reaches something you ship,
 * and a cluster of cards wired only to each other does not count, because it reaches nothing.
 *
 * Board-wide rather than per-target on purpose: a card wired to a single deliverable and nothing
 * else is still a campaign with stated context, and refusing to generate it would be wrong. Scoping
 * this to connectors into 'campaign' was the first thing I wrote here and it would have blocked a
 * campaign whose only wire ran card → deliverable, which is the common shape.
 */
export function hasWiredContext(board: FlowBoard): boolean {
  const nodeIds = new Set<string>([...board.objects.map((o) => o.id), ...board.placements.map((p) => p.id)])
  return board.connectors.some((e) => !nodeIds.has(e.to))
}

export function downstreamTargets(board: FlowBoard, nodeId: string, maxDepth = MAX_OBJECT_DEPTH): string[] {
  const outgoing = forwardEdges(board)
  const boardIds = new Set<string>([...board.objects.map((o) => o.id), ...board.placements.map((p) => p.id)])
  const out: string[] = []
  const seen = new Set<string>([nodeId])
  let frontier = outgoing.get(nodeId) ?? []
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)
      // Not a card on this board, so it is an output: the brief, a deliverable, a post.
      if (!boardIds.has(id)) { if (!out.includes(id)) out.push(id); continue }
      for (const dn of outgoing.get(id) ?? []) if (!seen.has(dn)) next.push(dn)
    }
    frontier = next
  }
  return out
}

/**
 * Does this card reach any OUTPUT — the campaign brief, a deliverable or a post — however indirectly?
 *
 * Drives the dimming that marks a card as not yet part of the campaign. It used to mean "has an edge
 * to the brief", so a chain of cards wired to each other and nothing else read as fully wired while
 * reaching nothing at all.
 */
export function reachesOutput(board: FlowBoard, nodeId: string, maxDepth = MAX_OBJECT_DEPTH): boolean {
  const outgoing = forwardEdges(board)
  const boardIds = new Set<string>([...board.objects.map((o) => o.id), ...board.placements.map((p) => p.id)])
  const seen = new Set<string>([nodeId])
  let frontier = outgoing.get(nodeId) ?? []
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)
      // Anything that is not another card on this board is an output: the brief, a deliverable key,
      // a post row id.
      if (!boardIds.has(id)) return true
      for (const dn of outgoing.get(id) ?? []) if (!seen.has(dn)) next.push(dn)
    }
    frontier = next
  }
  return false
}


/**
 * THE INSTRUCTIONS ONE ASSET IS WRITTEN UNDER, in precedence order.
 *
 * Exported so the panel and the writer read ONE function. They assembled the list differently: the
 * writer used [deliverable, this row, campaign, legacy] while the panel's generic readout used
 * [target, campaign, legacy]. Since buildDirection keeps the FIRST entry per key, pointing the
 * panel at a row would have omitted the deliverable's instructions entirely and rendered the row's
 * own as governing when it is in fact the one that loses. A readout that contradicts the writer is
 * worse than no readout, because it is believed.
 *
 * ORDER IS THE MECHANISM: a card wired straight to this deliverable beats a card wired to the brief,
 * which is what makes drawing a wire mean anything.
 */
export function directionForRow(
  resolved: { campaign: ResolvedDirection[]; byTarget: Map<string, ResolvedDirection[]> },
  deliverableKey: string,
  rowId: string,
  legacy: ResolvedDirection[] = [],
): ResolvedDirection[] {
  return [
    ...(resolved.byTarget.get(deliverableKey) ?? []),
    ...(resolved.byTarget.get(rowId) ?? []),
    ...resolved.campaign,
    ...legacy,
  ]
}
