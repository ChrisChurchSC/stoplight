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
 * RECORDS CHAIN THE SAME WAY, and that is a reversal worth explaining. This module used to resolve
 * DIRECTION transitively and records at a single hop: a card's records reached a campaign only by a
 * wire straight into the brief (see attachToCampaign). The argument was that the two have different
 * readers. Direction has exactly one consumer, the copy writer, so resolving it at draft time is
 * cheap and reversible, whereas records are read by the audience rotation, the coherence check,
 * fan-out and the Records rails, so a chain quietly widening who an asset is written to would be
 * felt in places nobody was looking at.
 *
 * That rule is now overturned on purpose, because it contradicted the flow the board exists to
 * support: start at a brand card, wire it through the cards that shape the message, then wire that
 * into the brief and pick deliverables. Under the single-hop rule the brand at the head of that
 * chain reached nothing, so a campaign that plainly described a brand came out unbranded and the
 * writer then refused it. An arrow means "this helps write that" for records exactly as it does for
 * direction, and anything that wants only the wires drawn straight into a target should read the
 * connectors, not this. The consequences the old note warned about are accepted knowingly: the four
 * readers above all widen together, which is the point of them sharing one definition.
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
 * Every record that reaches `target` on this board, however many hops back it starts.
 *
 * TRANSITIVE, per the reversal in the header: brand -> message -> brief hands the brief BOTH
 * records, because the brand is upstream of the brief even though no wire touches it. It is still
 * the one definition of "what is wired in", shared by the panel, deliverable inheritance and the
 * copy writer, so those three cannot drift apart again: they each used to answer it differently,
 * and the writer was still answering it from the campaign's stored references long after the panel
 * had stopped. Widening it here widens all three at once, which is intended.
 *
 * CYCLE-SAFE, because a board is drawn by a person. A -> B -> A and a card wired to itself are both
 * things you can draw, and a walk without a visited set would sit in that loop until the tab dies.
 * `seen` is what terminates this, not a depth cap. Unlike upstreamObjects there is no
 * MAX_OBJECT_DEPTH here on purpose: a cap would silently drop the card at the head of a long chain,
 * which is the exact failure this change exists to remove, and "silently" is the bad half.
 *
 * TRAVERSAL IS SEPARATE FROM CONTRIBUTION. A smart-object placement contributes every record inside
 * it AND is walked through: the old code returned early once it had read a placement's refs, which
 * under a transitive walk would stop the chain dead at the first object on it.
 *
 * Deduped across the whole walk rather than per hop, so a record reached down two paths appears
 * once, at the nearest position it was found.
 *
 * ORDER is breadth-first outwards from the target: cards wired straight in first, then their
 * feeders, ties broken by the order the wires were drawn. That is stable across runs (it reads the
 * connector array, never iteration order over a Set of ids) and it leaves the old single-hop result
 * intact as the leading block, so nothing that relied on "nearest wins" moved.
 *
 * COST is now O(nodes + edges) per call rather than O(edges into one target). It is called per
 * campaign, not per row, and a board is tens of nodes, so a plain walk is the right shape: no index
 * to build, no cache to invalidate against a board that changes on every drag.
 *
 * Returns ids without labels. Labels live on the record slices, which this module deliberately does
 * not know about; every reader matches on id first and treats a label as a legacy fallback. A card
 * that names no record contributes nothing, which is what makes "wired but empty" distinguishable
 * from "wired and carrying something".
 */
/**
 * The ids of every CARD that reaches `target`, nearest first.
 *
 * Exported and shared on purpose. The panel lists what is informing a target and the copy writer
 * reads what informs it, and those two answering the question differently is the exact drift this
 * file has warned about since it was written. One walk, one answer, both callers.
 *
 * ONLY CARDS CONDUCT. An output (the brief, a deliverable key, a post row id) contributes nothing
 * and passes nothing through, and the second half is the one that is easy to miss: connectors
 * between outputs exist. Dragging the brief hub onto a deliverable persists a deliverable ->
 * campaign wire, so a walk that traversed outputs would climb from the campaign into that
 * deliverable and collect every card the user had deliberately scoped to it alone. downstreamTargets
 * and reachesOutput already stop at outputs; this is the same rule in the other direction.
 *
 * Breadth-first outward from the target, so nearest cards come first and ties keep the order the
 * wires were drawn in. Stable across runs because it reads the connector array and never iterates a
 * Set. No depth cap, unlike upstreamObjects: a cap silently drops the card at the head of a long
 * chain, which is the failure chaining exists to remove. The visited set is seeded with the target,
 * so a wire looping back into it stops there.
 */
export function upstreamCardIds(board: FlowBoard, target: string): string[] {
  const objectById = new Map(board.objects.map((o) => [o.id, o]))
  const placementById = new Map(board.placements.map((p) => [p.id, p]))
  const isCard = (id: string): boolean => placementById.has(id) || objectById.has(id)
  const incoming = new Map<string, string[]>()
  for (const e of board.connectors) {
    const list = incoming.get(e.to)
    if (list) list.push(e.from)
    else incoming.set(e.to, [e.from])
  }
  const out: string[] = []
  const seen = new Set<string>([target])
  let frontier = incoming.get(target) ?? []
  while (frontier.length) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)
      if (!isCard(id)) continue
      out.push(id)
      for (const up of incoming.get(id) ?? []) if (!seen.has(up)) next.push(up)
    }
    frontier = next
  }
  return out
}

export function wiredRefsFor(board: FlowBoard, smartObjects: SmartObject[], target: string): FlowReference[] {
  const byId = new Map(smartObjects.map((o) => [o.id, o]))
  const objectById = new Map(board.objects.map((o) => [o.id, o]))
  const placementById = new Map(board.placements.map((p) => [p.id, p]))
  /** What ONE node contributes, said once so the walk can stay about ids. */
  const refsOf = (id: string): FlowReference[] => {
    // A placed smart object contributes every record inside it; the library object is the truth.
    const placed = placementById.get(id)
    if (placed) return byId.get(placed.smartObjectId)?.refs ?? []
    const obj = objectById.get(id)
    if (!obj) return []
    if (obj.smartObjectId) return byId.get(obj.smartObjectId)?.refs ?? []
    const type = REF_TYPE_FOR_OBJECT_KIND[obj.kind]
    return type && obj.refId ? [{ type, id: obj.refId, label: '' }] : []
  }
  const out: FlowReference[] = []
  const push = (r: FlowReference) => {
    if (!out.some((x) => x.type === r.type && x.id === r.id)) out.push(r)
  }
  // The walk lives in upstreamCardIds so the panel cannot answer this differently. Dedupe is applied
  // here rather than there, and so holds across the whole chain rather than per hop.
  for (const id of upstreamCardIds(board, target)) for (const r of refsOf(id)) push(r)
  return out
}

/**
 * The smart OBJECTS wired into a target, kept as objects rather than dissolved into their records.
 *
 * wiredRefsFor answers "which records reach this", which is what the pools need, and flattening an
 * object into its refs is the right answer to that question. It is also exactly why a document
 * attached to an object had no route to the writer: by the time that walk finishes, the object the
 * document belongs to no longer exists as a thing in the result, only its parts do.
 *
 * SHARES upstreamCardIds WITH wiredRefsFor, deliberately. Two walks that could disagree about what
 * is wired would eventually put a document in front of the writer describing an object whose records
 * never arrived, or the reverse — and the disagreement would be invisible, because each function
 * would look correct on its own.
 */
export function wiredObjectsFor(board: FlowBoard, smartObjects: SmartObject[], target: string): SmartObject[] {
  const byId = new Map(smartObjects.map((o) => [o.id, o]))
  const objectById = new Map(board.objects.map((o) => [o.id, o]))
  const placementById = new Map(board.placements.map((p) => [p.id, p]))
  /** The library object a node stands for, by either of the two ways a board can name one. */
  const objectIdOf = (id: string): string | undefined =>
    placementById.get(id)?.smartObjectId ?? objectById.get(id)?.smartObjectId
  const out: SmartObject[] = []
  const seen = new Set<string>()
  for (const id of upstreamCardIds(board, target)) {
    const oid = objectIdOf(id)
    // Deduped by OBJECT, not by node: the same library object placed twice on a board is one object
    // with one document, and sending it twice would read as two briefs that happen to agree.
    if (!oid || seen.has(oid)) continue
    seen.add(oid)
    const o = byId.get(oid)
    if (o) out.push(o)
  }
  return out
}

/**
 * The CARDS wired into a target that carry a document of their own, nearest first.
 *
 * The same question wiredObjectsFor asks one rung down. A smart object's document describes a bundle
 * somebody assembled; a card's describes the one thing the card is, and once a card can be given a
 * .md instead of a form, that document IS the card. Both reach the writer, in one list, on the same
 * terms — so this shares upstreamCardIds with the other two walks for the reason stated there: three
 * answers to "what is wired in" would eventually disagree, invisibly.
 *
 * A card inside a smart object contributes its document too. The placement stands in for its members
 * everywhere else on this board, and a document is not the exception: bundling a card is a statement
 * about where it lives, never a decision to stop reading what it says.
 *
 * Cards with no document are dropped rather than listed empty, exactly as objects are: the block
 * this feeds is about what a document says, and naming the cards that have not been written about
 * spends context saying nothing.
 */
export function wiredCardDocsFor(board: FlowBoard, target: string): CanvasObject[] {
  const objectById = new Map(board.objects.map((o) => [o.id, o]))
  const placementById = new Map(board.placements.map((p) => [p.id, p]))
  const out: CanvasObject[] = []
  const seen = new Set<string>()
  /** Every card a node stands for: itself, or everything inside it if it is a placement. */
  const cardsAt = (id: string): CanvasObject[] => {
    const placed = placementById.get(id)
    if (placed) return placed.memberIds.map((m) => objectById.get(m)).filter((o): o is CanvasObject => !!o)
    const o = objectById.get(id)
    return o ? [o] : []
  }
  for (const id of upstreamCardIds(board, target)) {
    for (const card of cardsAt(id)) {
      // Deduped by CARD, so a card reached both directly and through the object holding it sends its
      // document once. Two copies of one brief read as two briefs that happen to agree.
      if (seen.has(card.id) || !card.reference?.text.trim()) continue
      seen.add(card.id)
      out.push(card)
    }
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
  /**
   * Channels cut off from the brief, by deliverable key: see FlowBoard.detached. A channel hangs off
   * the campaign by derivation rather than by a drawn wire, so cutting that line is recorded as an
   * absence, and this is where the absence has to bite. Without it the line would be gone from the
   * canvas while every instruction on the campaign kept reaching the copy, which is the one thing a
   * board must never do: the picture and the writing have to agree.
   *
   * Legacy campaign direction is cut with it. It is campaign-wide by definition, so a channel that
   * is no longer taking the campaign's instructions is not taking those either.
   */
  detached: readonly string[] = [],
): ResolvedDirection[] {
  const cut = detached.includes(deliverableKey)
  return [
    ...(resolved.byTarget.get(deliverableKey) ?? []),
    ...(resolved.byTarget.get(rowId) ?? []),
    ...(cut ? [] : resolved.campaign),
    ...(cut ? [] : legacy),
  ]
}
