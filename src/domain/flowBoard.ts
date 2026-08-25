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

import type { CardGroup } from './cardGroups'
import { pruneGroups } from './cardGroups'
import type { ObjectReference } from './objectReference'

/** The kinds of object you can drop on a board. */
export type CanvasObjectKind =
  | 'audience' | 'data-source' | 'note'
  | 'proof-point' | 'trigger' | 'message' | 'voice' | 'company' | 'person' | 'concept' | 'season'
  | 'brand' | 'product' | 'pattern'

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
export const REF_TYPE_FOR_OBJECT_KIND: Partial<Record<CanvasObjectKind, 'segment' | 'proof' | 'company' | 'person' | 'message' | 'concept' | 'voice' | 'season' | 'dataset' | 'product' | 'trigger' | 'pattern'>> = {
  audience: 'segment',
  'proof-point': 'proof',
  company: 'company',
  person: 'person',
  // A Message card names a Message record, and until this entry existed refForObject returned null
  // for it: the card's direction travelled, but the message it pointed at reached nothing.
  message: 'message',
  concept: 'concept',
  voice: 'voice',
  season: 'season',
  /**
   * A Data source card names a data set, and until this entry existed it contributed nothing at all:
   * refForObject returned null, so the canvas drew the wire, flipped the attached styling and listed
   * the card under "Applied to" while the copy writer never heard about the table. Four ways to fetch
   * a table, and the table reached nothing.
   */
  'data-source': 'dataset',
  // Both had a card, a library and a picker on the canvas while carrying no ref type, so the card
  // drew, wired, lit up as connected and reached the writer with nothing.
  product: 'product',
  trigger: 'trigger',
  /**
   * A Pattern card names the SHAPE the copy takes — a hook, a format, a structure, a trend worth
   * riding. Unlike every other kind here it is meant to be pinned per ASSET rather than per
   * campaign: "argue this message" is true of a campaign, "open on the objection and answer it"
   * is true of one post. See the pattern branch in poolsFrom and DraftAsset.pattern.
   */
  pattern: 'pattern',
}

/**
 * KINDS WHOSE RECORD A CARD CAN MAKE, when the brand has none to pick yet.
 *
 * A record-linked card picks from an established record, which is the whole point of records: an
 * audience two campaigns argue to is one audience. But a picker over an empty list is a dead end,
 * and a fresh brand is nothing but empty lists. Every kind here offers "+ New …" as the last option
 * in its own dropdown, so the card you dropped because you needed the thing is where you make it.
 *
 * `brand` is here without a ref type above, deliberately: a brand OWNS the campaign rather than
 * being referred to by it, and you still have to be able to name the first one.
 *
 * `data-source` is deliberately ABSENT: a data set is a TABLE, and minting one from a name produces
 * an empty spreadsheet titled after a question nobody can answer. The card resolves an existing data
 * set instead, and its own picker is where a new one is made.
 *
 * Lives here, next to the ref-type map, so the parity between the two is testable: a new kind that
 * carries a record and forgets this set ships a card that can only ever pick from nothing.
 */
export const CREATABLE_OBJECT_KINDS = new Set<CanvasObjectKind>([
  'audience', 'proof-point', 'company', 'person', 'message', 'voice', 'trigger',
  'brand', 'product', 'concept', 'season', 'pattern',
])

/**
 * WHETHER PRESSING A KIND ON THE TOOLBAR OPENS THE RECORD STEP, or just drops the card.
 *
 * The record step is the list between naming a kind and the card landing, and it is worth a step
 * only when it can end in a card. It can end in a card two ways: there is something to pick, or the
 * kind can mint what it needs from a name. A kind with neither has a menu that cannot be answered,
 * and the toolbar button becomes a button that opens a sentence.
 *
 * WHICH IS EXACTLY WHAT DATA SOURCE WAS. It is the one kind that carries a record list and is
 * deliberately not creatable (see CREATABLE_OBJECT_KINDS above: a data set is a table, and minting
 * one from a name produces an empty spreadsheet titled after a question nobody can answer). On a
 * brand with no data sets its list came back EMPTY rather than absent, so it took the menu path
 * meant for kinds that have records, drew a menu with nothing in it and no "+ New" underneath, and
 * no card ever landed. Pressing Data source did nothing but print a note — one which, on a bound
 * brand, read "Make one below and it joins the library" directly above the absence of any below.
 *
 * A Data source card with no table yet is a legitimate card. It says a table goes here, and its
 * inspector is where one is connected, pasted, uploaded or pulled. So it drops, as the toolbar's
 * own comment had claimed it did all along.
 *
 * `optionCount` rather than the options themselves: the decision is about whether a list can be
 * answered, not about what is in it, and passing the array would tempt a caller to filter here.
 * A kind with NO record list at all (a Note) never reaches this — the caller drops it on the null.
 */
export const opensRecordStep = (kind: CanvasObjectKind, optionCount: number): boolean =>
  optionCount > 0 || CREATABLE_OBJECT_KINDS.has(kind)

export interface CanvasObject {
  id: string
  kind: CanvasObjectKind
  /**
   * WHAT THIS CARD IS CALLED, in the person's own words.
   *
   * Until this existed a card was named by whatever it happened to point at — the linked record's
   * label, or the first line of a sticky's text, or failing both the bare kind. So three Audience
   * cards on one board read as "Audience", "Audience", "Audience" in the Layers panel, in the
   * grid's Applied-to list and in every "what feeds this asset" answer, until each one had a record
   * picked. The name belongs to the CARD: it survives changing the record underneath it, and it is
   * what the person typed rather than what the library happened to call the thing.
   *
   * Not the record's name. Renaming a card is a board-local act and must never rewrite a shared
   * record that other campaigns are reading — that is what the record forms in the inspector are
   * for. Two Audience cards can name the same segment and still be "Enterprise, cold" and
   * "Enterprise, renewal".
   *
   * Optional because every board saved before this existed has none, and a card with no name still
   * answers to whatever it points at. See objectName for the ladder.
   */
  name?: string
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
  /**
   * THE DOCUMENT THIS CARD IS, uploaded as a .md and kept verbatim.
   *
   * A card is given its context in one of two ways: describe it and have the record filled in, or
   * hand it the document that already says all of this. The second one is stored rather than parsed
   * — the material a person wrote about a buyer, a proposition or an account is worth more to the
   * writer whole than squeezed into a dozen fields, and a document you can read back is a document
   * you can argue with. It travels to the copy writer beside the smart objects' own references, on
   * the same terms and out of the same budget (see ObjectReference).
   *
   * It never fills a field. What the card's record holds and what its document says are two answers
   * from two sources, and quietly merging them would leave nobody able to say which said what.
   */
  reference?: ObjectReference
}

/**
 * WHAT TO CALL A CARD, as one ladder rather than five copies of it.
 *
 * The canvas, the Layers panel, the grid's object columns, a smart object's default name and its
 * member list each had their own version of "name || record || text || kind", which is how the same
 * card could read as "Audience" in one place and "Enterprise buyers" in another. The card's own name
 * wins, then whatever record or smart object it points at, then the first line of a sticky's text.
 *
 * `linked` is passed in rather than resolved here: a card names a record in one of a dozen
 * collections that live in the store, and a domain module has no business reaching for those.
 * `fallback` is for the callers that would rather print the kind than print nothing.
 */
export const objectName = (o: CanvasObject, linked?: string, fallback = ''): string =>
  o.name?.trim() || linked?.trim() || o.text.trim().split('\n')[0].trim() || fallback

/**
 * A kind as a human word — "proof point", "data source" — for the readers that cannot reach
 * OBJECT_META. That registry carries JSX icons and so lives in a .tsx; the store is plain state and
 * has no business importing React to name a thing. DERIVED from the kind rather than a second list
 * of labels, so there is nothing here that can fall out of step with the registry.
 */
export const kindWord = (k: CanvasObjectKind): string => k.replace(/-/g, ' ')

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
  /**
   * CHANNELS CUT OFF FROM THE BRIEF, by deliverable key.
   *
   * A channel hangs off the campaign because its assets carry the campaign's name, so the line
   * between them is derived rather than drawn and there is no connector to remove. This is the
   * exception the person asked for: cut the line and the channel keeps every asset it has, but stops
   * inheriting what is wired to the campaign, so its copy is written from the brief alone.
   *
   * Stored as the ABSENCE of a connection rather than as a connection, because belonging to the
   * campaign is still the default and the overwhelmingly common case. A board with nothing detached
   * carries no field at all, which is also why it is optional: every board saved before this existed
   * loads with the old meaning intact.
   */
  detached?: string[]
  /**
   * CARDS TIED TOGETHER SO AN ARRANGEMENT HOLDS.
   *
   * A group is spatial, not semantic: it says "these cards belong at these offsets from each
   * other", so selecting one selects all and dragging one drags all. That is the whole of it — a
   * group changes nothing about what a card means, what it is wired to, or what gets written from
   * it. The semantic bundle is a smart object (see SmartPlacement), which is a different move
   * entirely: it collapses context cards into one named, reusable thing.
   *
   * Kept on the board rather than on the cards because membership is a property of THIS canvas.
   * Any node id the board can position may be a member — an object card, a placement, a channel or
   * a post — which is also why it lives beside `pos` and is pruned by the same rules.
   *
   * Optional, and omitted when empty, so every board saved before groups existed loads unchanged.
   */
  groups?: CardGroup[]
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

/**
 * REPOINT THE BUILDER'S WIRES AT THE DELIVERABLES THEY TURNED INTO.
 *
 * In build mode a deliverable is a NODE with a minted id (`dl_…`), because it does not exist yet and
 * a thing you are still configuring needs an identity of its own. The moment Build runs it becomes a
 * group of assets, identified by what it IS (deliverableKeyFor). Nothing translated between the two,
 * so a wire drawn from a card to a deliverable in the builder was handed to the campaign still
 * pointing at the node id, and the campaign's board has no such endpoint: pruneBoard dropped it on
 * the next openView, quietly, and the line the person drew was gone.
 *
 * Here rather than in the component because it is the reverse of deliverableKeyFor and belongs next
 * to it: both answer "what is this deliverable called right now", and a copy of either that drifted
 * would put a wire on a board pointing at a deliverable nothing answers to.
 *
 * Endpoints with no entry are left exactly as they are. A node that seeded no assets became no
 * deliverable, and inventing a key for it would be worse than the dangling wire pruneBoard removes.
 */
export function remapBuiltTargets(
  connectors: readonly { from: string; to: string }[],
  builtKeyByNodeId: ReadonlyMap<string, string>,
): { from: string; to: string }[] {
  return connectors.map((c) => {
    const key = builtKeyByNodeId.get(c.to)
    return key ? { ...c, to: key } : c
  })
}

/**
 * A NODE HAS BEEN RENAMED: MOVE ITS WIRES RATHER THAN LOSING THEM.
 *
 * A deliverable's key IS its identity (see deliverableKeyFor), and branchOf is folded into it — so
 * unbranching a channel renames it. Every card wired to the old name then pointed at something
 * nothing answers to, and the next openView pruned those edges as dangling: a card wired to a
 * channel quietly stopped feeding it, and the wire could not even be undrawn because it was gone.
 * The key carries no colon, so pruneBoard's escape hatch for build-mode ids does not cover it.
 *
 * Beside remapBuiltTargets because it is the same move for the same reason, in the other direction:
 * that one follows a deliverable from node id to key, this one follows it from key to key.
 *
 * DEDUPES AND DROPS SELF-EDGES, because a rename can be a MERGE. Unbranching into a channel the
 * campaign already has turns two deliverables into one, so two edges can collapse onto the same
 * pair, and a card wired to both ends up wired to itself.
 */
export function renameEndpoint(
  connectors: readonly { from: string; to: string }[],
  oldId: string,
  newId: string,
): { from: string; to: string }[] {
  if (oldId === newId) return [...connectors]
  const swap = (e: string) => (e === oldId ? newId : e)
  const seen = new Set<string>()
  const out: { from: string; to: string }[] = []
  for (const c of connectors) {
    const from = swap(c.from)
    const to = swap(c.to)
    if (from === to) continue
    // NUL is the delimiter because a deliverable key can carry an asset name, so a space or a colon
    // both appear inside real ids. Same convention as cardTrail's edgeKey.
    const key = `${from}\u0000${to}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ from, to })
  }
  return out
}

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
  /**
   * WHAT INHERITS THE WIRES OF AN OBJECT THAT HAS GONE.
   *
   * deleteSmartObject removes the object from the library and never touches a board, so this is
   * where a placement pointing at a deleted object is reconciled. The decision for the CARDS was
   * already made and is right: they survive, and the map below clears their smartObjectId so they
   * carry on as plain cards. Their WIRES were being dropped on the floor, because the placement
   * leaves liveIds and every connector touching it then fails the endpoint test. The cards came
   * back loose and unattached, the autosave wrote that back, and redrawing by hand was the only
   * repair — on every campaign the object had been placed on.
   *
   * A wire to the object said "everything in here informs this campaign". Once the object is gone
   * the members ARE the everything, so each surviving member inherits the edge, in whichever
   * direction it ran. An object holding nothing that survived leaves no heir and its edges go, since
   * there is nothing left to carry the context and the edge would point at a node that is not there.
   */
  const heirs = new Map<string, string[]>()
  for (const p of board.placements) {
    if (known.smartObjectIds.has(p.smartObjectId)) continue
    const surviving = p.memberIds.filter((m) => objectIds.has(m))
    if (surviving.length) heirs.set(p.id, surviving)
  }
  const legal = (e: string): boolean => liveIds.has(e) || !!known.targetIds?.has(e) || e.includes(':')
  const inherited: { from: string; to: string }[] = []
  const seenEdge = new Set<string>()
  for (const c of board.connectors) {
    for (const from of heirs.get(c.from) ?? [c.from]) {
      for (const to of heirs.get(c.to) ?? [c.to]) {
        // A member wired to its own container becomes a card wired to itself, which reads as a card
        // pointing at nothing. Two edges onto the same pair — the object's and the member's own —
        // become one.
        if (from === to) continue
        const key = `${from}\u0000${to}`
        if (seenEdge.has(key)) continue
        if (!legal(from) || !legal(to)) continue
        seenEdge.add(key)
        inherited.push({ from, to })
      }
    }
  }
  return {
    key: board.key,
    objects: objects.map((o) => (o.smartObjectId && !known.smartObjectIds.has(o.smartObjectId) ? { ...o, smartObjectId: undefined } : o)),
    placements,
    pos: board.pos,
    // An edge to a node that no longer exists would draw to nowhere, and an attachment edge would
    // keep contributing refs for a deleted object.
    // An endpoint is legal if it is on the board, is a live output, or is a build-mode brief
    // sub-card (`${nodeId}:${briefIndex}` — the one id shape that genuinely carries a colon).
    // Endpoints on a dropped placement are moved onto its surviving cards first; see heirs.
    connectors: inherited,
    // A cut survives only while the channel it names does. A key left behind by a channel that has
    // gone would silently cut off a NEW channel that later takes the same key, since the key is
    // derived from the channel and type rather than being unique to one.
    ...(board.detached?.length
      ? (() => {
          const kept = board.detached.filter((k) => known.targetIds?.has(k))
          return kept.length ? { detached: kept } : {}
        })()
      : {}),
    // A group holds node ids, so it goes stale exactly the way a connector endpoint does — and is
    // kept honest by the same test for what still exists. Members that have gone are dropped, and
    // a group left holding fewer than two cards dissolves rather than framing a single card.
    ...(board.groups?.length
      ? (() => {
          const live = new Set<string>()
          for (const g of board.groups) {
            for (const m of g.ids) {
              if (liveIds.has(m) || known.targetIds?.has(m) || m.includes(':')) live.add(m)
            }
          }
          const kept = pruneGroups(board.groups, live)
          return kept.length ? { groups: kept } : {}
        })()
      : {}),
  }
}

/**
 * TAKE THE CHANNEL OUT OF THE BOARD WITHOUT TAKING ANYTHING WITH IT.
 *
 * A channel was never a stored thing (it is a group of assets keyed channel|assetType) but it WAS an
 * identity, and three kinds of authored work were filed under it: connectors drawn to or from it,
 * whether it is detached from the brief, and where somebody dragged it. Stop drawing the node and
 * all three point at something that no longer exists. pruneBoard then deletes them on the next
 * openView, quietly, which is the failure this file already carries a comment about: the wire that
 * explained it disappeared and could never be undrawn.
 *
 * So the work moves down to the assets it was always standing for, rather than being deleted:
 *
 *  - A WIRE to a channel becomes a wire to each of its assets. That is what it always meant: the
 *    channel had no copy of its own for a record to inform. One line in becomes several, which is
 *    honest, because it was one line standing for several relationships.
 *
 *  - DETACHED FROM THE BRIEF moves onto the assets too. It is stored as the absence of an
 *    inheritance, so the assets keep exactly the inheritance they had; it stops being expressed at a
 *    level the board no longer has.
 *
 *  - A DRAGGED POSITION goes. It positioned a card that is not drawn any more, and the assets carry
 *    their own. Keeping it leaves coordinates nothing can ever use again.
 *
 * The map of channel key to asset ids is the authority on what IS a channel, rather than a guess
 * from the shape of the string. Anything that looks like a channel key and is not in the map is a
 * channel with no assets left, so it is dropped: the same answer pruneBoard gives, made explicit
 * here rather than left to happen later.
 */
export function flattenChannelNodes(board: FlowBoard, assetIdsByChannel: Map<string, string[]>): FlowBoard {
  const looksLikeChannelKey = (id: string): boolean => id.includes('|')
  /** The ids a wire should reach now: the channel's assets, or the endpoint itself if it is not one. */
  const resolve = (id: string): string[] => {
    const assets = assetIdsByChannel.get(id)
    if (assets) return assets
    return looksLikeChannelKey(id) ? [] : [id]
  }

  const seen = new Set<string>()
  const connectors: { from: string; to: string }[] = []
  for (const c of board.connectors) {
    for (const from of resolve(c.from)) {
      for (const to of resolve(c.to)) {
        // Two channels sharing an asset, or a channel wired to one of its own assets, can produce a
        // self-edge once both ends resolve. A card wired to itself is not a relationship.
        if (from === to) continue
        const k = from + ' ' + to
        if (seen.has(k)) continue
        seen.add(k)
        connectors.push({ from, to })
      }
    }
  }

  const detached = [...new Set((board.detached ?? []).flatMap(resolve))]

  const pos: FlowBoard['pos'] = {}
  for (const [id, p] of Object.entries(board.pos)) {
    if (assetIdsByChannel.has(id) || looksLikeChannelKey(id)) continue
    pos[id] = p
  }

  return {
    ...board,
    connectors,
    pos,
    ...(board.detached ? { detached } : {}),
  }
}
