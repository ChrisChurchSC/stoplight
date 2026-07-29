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
  | 'brand' | 'product'

/** What an object DOES, and the value of its data-role attribute. */
export type ObjectRole = 'output' | 'input' | 'markup' | 'brief'
/** The sub-grouping inside the input role, used by the toolbar palette. */
export type ObjectFamily = 'who' | 'says' | 'when' | 'draws' | 'markup'

/**
 * The record type an object of each kind contributes to the campaign. Only four kinds carry a
 * record; the rest (message, voice, note, …) speak to the copy writer through direction instead.
 *
 * Lives here rather than in FlowsView because the STORE needs it: propagating a smart-object edit
 * across campaigns has to know what a plain card contributes, and comparing contributions needs
 * only a type and an id, never a label.
 */
export const REF_TYPE_FOR_OBJECT_KIND: Partial<Record<CanvasObjectKind, 'segment' | 'proof' | 'company' | 'person' | 'message' | 'concept' | 'voice'>> = {
  audience: 'segment',
  'proof-point': 'proof',
  company: 'company',
  person: 'person',
  // A Message card names a Message record, and until this entry existed refForObject returned null
  // for it: the card's direction travelled, but the message it pointed at reached nothing.
  message: 'message',
  concept: 'concept',
  voice: 'voice',
}

export interface CanvasObject {
  id: string
  kind: CanvasObjectKind
  /** The team note. Never sent to the copy writer; direction is what reaches it. */
  text: string
  /** For record-linked kinds, the record's id. */
  refId?: string
  /** The brand-library smart object this shows, when it shows one instead of a raw record. */
  smartObjectId?: string
  /**
   * What this card instructs the writer to do, as direction entries (see src/domain/direction.ts).
   *
   * ON THE OBJECT, not on the campaign. Direction used to be keyed by (campaign, kind), so a board
   * could hold only ONE audience pain no matter how many audience cards were on it: a second card
   * showed the first one's text and overwrote it on edit. That was defensible while the board was
   * session state and a card could not outlive a reload. The board is durable now, so the
   * instruction belongs to the card that carries it.
   */
  direction?: { key: string; value: string }[]
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

/**
 * The canvas id of the DELIVERABLE an asset belongs to. A deliverable is not stored: it is derived
 * by grouping a campaign's assets on this key, so the key is its identity everywhere — in `pos`, in
 * a connector endpoint, and in what pruneBoard will accept.
 *
 * Shared because two copies of this template would drift, and a drift means an edge silently
 * pointing at a deliverable that no longer answers to that name.
 */
export const deliverableKeyFor = (r: { channel: string; assetType?: string; branchOf?: string }): string =>
  `${r.channel}|${r.assetType ?? ''}${r.branchOf ? `|↳${r.branchOf}` : ''}`

export const emptyBoard = (key: string): FlowBoard => ({ key, objects: [], placements: [], pos: {}, connectors: [] })

/**
 * The board key for a campaign that does not exist yet. The builder needs its own slot so a
 * half-typed name does not scatter boards, and everything keyed to it has to be handed over to the
 * real campaign the moment Build names one (see adoptBuilderBoard).
 */
export const BUILDER_BOARD_KEY = '__new-flow__'

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
  known: {
    objectKinds: Set<string>
    smartObjectIds: Set<string>
    /**
     * The OUTPUT ids an edge may legally point at: deliverable keys and post row ids. Without this
     * the only survivors were board ids and anything containing a colon, and neither a deliverable
     * key ("blog|article") nor a row id ("row_…") has one — so every wire from a card to a
     * deliverable or a post was deleted on the next openView. The records it had written stayed on
     * the rows, so the copy kept the context while the wire that explained it disappeared and could
     * never be undrawn.
     */
    targetIds?: Set<string>
  },
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
    // An endpoint is legal if it is on the board, is a live output, or is a build-mode brief
    // sub-card (`${nodeId}:${briefIndex}` — the one id shape that genuinely carries a colon).
    connectors: board.connectors.filter((c) => [c.from, c.to].every((e) => liveIds.has(e) || known.targetIds?.has(e) || e.includes(':'))),
  }
}
