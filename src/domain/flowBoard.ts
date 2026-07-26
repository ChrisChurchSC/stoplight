/**
 * THE BOARD: everything on a campaign canvas that is not a deliverable, persisted per campaign.
 *
 * Objects, the smart-object placements showing on this canvas, where everything sits, and the links
 * drawn between them. Until this existed the whole board was React state, so a reload lost it and
 * openView had to clear it to stop one campaign's board following you into the next.
 *
 * The types live here rather than in FlowsView because a persisted slice has to be typed outside
 * the component that renders it. OBJECT_META stays in the component: it carries JSX icons.
 */

/** The kinds of object you can drop on a board. */
export type CanvasObjectKind =
  | 'audience' | 'data-source' | 'note'
  | 'proof-point' | 'trigger' | 'message' | 'voice' | 'company' | 'person' | 'concept' | 'season'

/** What an object DOES, and the value of its data-role attribute. */
export type ObjectRole = 'output' | 'input' | 'markup' | 'brief'
/** The sub-grouping inside the input role, used by the toolbar palette. */
export type ObjectFamily = 'who' | 'says' | 'when' | 'draws' | 'markup'

export interface CanvasObject {
  id: string
  kind: CanvasObjectKind
  /** The team note. Never sent to the copy writer; direction is what reaches it. */
  text: string
  /** For record-linked kinds, the record's id. */
  refId?: string
  /** The brand-library smart object this shows, when it shows one instead of a raw record. */
  smartObjectId?: string
}

/**
 * A smart object AS PLACED on this canvas. The name and the contents live on the SmartObject in the
 * brand library; this only says "it is on this board", which is what lets the same object sit on
 * several campaigns and be renamed once.
 */
export interface SmartPlacement {
  id: string
  smartObjectId: string
  /** The object ids currently drawn inside it on this canvas. */
  memberIds: string[]
}

export interface FlowBoard {
  /** The campaign this board belongs to, or the builder's slot for an unbuilt campaign. */
  key: string
  objects: CanvasObject[]
  placements: SmartPlacement[]
  /** Position per node id, in stack coordinates. Covers objects, placements and deliverables. */
  pos: Record<string, { x: number; y: number }>
  connectors: { from: string; to: string }[]
}

export const emptyBoard = (key: string): FlowBoard => ({ key, objects: [], placements: [], pos: {}, connectors: [] })

/**
 * Ids must be unique across sessions now that they persist. These were module-level counters
 * (`co_1`, `pl_1`), which reset to 1 on every reload: two objects created in two sessions on the
 * same board would have collided, and pos is keyed by id, so they would have stacked and dragged
 * together. Same timestamp-plus-random shape as freshSmartObjectId.
 */
export const freshObjectId = (): string => `co_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
export const freshPlacementId = (): string => `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

/** The board for a campaign, or an empty one. Never returns undefined, so callers need no guard. */
export function boardFor(boards: FlowBoard[], key: string): FlowBoard {
  return boards.find((b) => b.key === key) ?? emptyBoard(key)
}

/**
 * Drop anything that cannot be resolved on load. A refId or smartObjectId is an unvalidated
 * cross-namespace foreign key (records, brand datasets, connectors and library objects all mint
 * their own), so a deleted record would otherwise leave an object pointing at nothing.
 */
export function pruneBoard(
  board: FlowBoard,
  known: { objectKinds: Set<string>; smartObjectIds: Set<string> },
): FlowBoard {
  const objects = board.objects.filter((o) => known.objectKinds.has(o.kind))
  const objectIds = new Set(objects.map((o) => o.id))
  const placements = board.placements
    .filter((p) => known.smartObjectIds.has(p.smartObjectId))
    .map((p) => ({ ...p, memberIds: p.memberIds.filter((m) => objectIds.has(m)) }))
  const liveIds = new Set([...objectIds, ...placements.map((p) => p.id), 'campaign'])
  return {
    key: board.key,
    objects: objects.map((o) => (o.smartObjectId && !known.smartObjectIds.has(o.smartObjectId) ? { ...o, smartObjectId: undefined } : o)),
    placements,
    pos: board.pos,
    // An edge to a node that no longer exists would draw to nowhere, and an attachment edge would
    // keep contributing refs for a deleted object.
    connectors: board.connectors.filter((c) => (liveIds.has(c.from) || c.from.includes(':')) && (liveIds.has(c.to) || c.to.includes(':'))),
  }
}
