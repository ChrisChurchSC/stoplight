import { MAX_OBJECT_DEPTH } from './smartObject'
import type { CanvasObject, FlowBoard } from './flowBoard'

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
