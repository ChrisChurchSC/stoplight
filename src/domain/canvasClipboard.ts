/**
 * COPYING PART OF ONE CAMPAIGN CANVAS INTO ANOTHER.
 *
 * The thing a person does after laying out a campaign they like is lay out the next one, and until
 * this existed the only way to carry anything across was to build it again from the picker: the
 * Audience card with its direction typed into it, the Brand card, the wire from each of them into
 * the brief, the Instagram channel and its four posts. All of it, per campaign, by hand.
 *
 * The rules live here rather than in FlowsView because they are decisions, not rendering — what a
 * copy is allowed to carry into another brand, and what a pasted asset is allowed to claim about
 * itself — and both are the kind of thing that should fail a test rather than be re-argued.
 *
 * TWO HALVES, because a campaign canvas holds two unlike things:
 *
 *  - OBJECT CARDS are board state. Copying one is cloning a record under a new id, and the whole
 *    job is remapping the ids so the wiring, the positions and the groups survive the trip.
 *  - A CHANNEL IS NOT STORED. It is derived by grouping the campaign's assets on channel|type (see
 *    deliverableKeyFor), so there is no channel object to clone: copying a channel means copying
 *    its ASSETS, and pasting one means writing real rows into the target campaign.
 */

import type { CardGroup } from './cardGroups'
import { MIN_GROUP } from './cardGroups'
import type { CanvasObject, SmartPlacement } from './flowBoard'
import { deliverableKeyFor, freshObjectId, freshPlacementId } from './flowBoard'
import { buildUtm } from './tracking'
import type { TrafficRow } from './types'

/**
 * WHAT WAS COPIED, and where from.
 *
 * The source campaign and brand are on the payload because the paste has to know whether it is
 * crossing a boundary: pasting into the campaign it came from means something different for names
 * and dates, and pasting into another BRAND means the record links must not travel (see
 * `crossBrand` in pasteObjects).
 */
export interface CanvasClipboard {
  /** The campaign copied from, or null for the builder's unbuilt board. */
  fromCampaign: string | null
  /** The brand in scope on the canvas copied from. '' when the canvas had no single brand. */
  fromBrand: string
  objects: CanvasObject[]
  placements: SmartPlacement[]
  /** Connectors whose endpoints are both inside the copy (or the brief — see pasteObjects). */
  connectors: { from: string; to: string }[]
  /** Position per copied node id, exactly as it sat on the source board. */
  pos: Record<string, { x: number; y: number }>
  groups: CardGroup[]
  /** The assets behind every copied channel and post. */
  rows: TrafficRow[]
  /** The deliverable keys copied, so a wire from a card to a channel can be kept. */
  delivKeys: string[]
  /**
   * Which of those channels were CUT OFF from their brief (see FlowBoard.detached).
   *
   * Carried because being cut is a decision somebody made, not a default — the channel is on the
   * board taking nothing from the campaign's cards, deliberately — and a paste that quietly
   * reattached it would change what its copy gets written from.
   */
  detachedKeys: string[]
  copiedAt: number
}

/** Nothing selected that can be copied. Distinct from a null clipboard, which is "nothing yet". */
export const isEmptyClipboard = (c: CanvasClipboard | null): boolean =>
  !c || (!c.objects.length && !c.placements.length && !c.rows.length)

/**
 * HOW MANY THINGS, in the words the canvas uses for them.
 *
 * Assembled here so the copy toast, the paste toast and the menu label cannot describe the same
 * clipboard three different ways. Channels are counted by their key rather than by their assets:
 * "4 posts" is what a channel holds, and reporting a channel as its post count is how a person
 * ends up thinking they copied four separate things.
 */
export function describeClipboard(c: CanvasClipboard): string {
  const parts: string[] = []
  const cards = c.objects.length + c.placements.length
  if (cards) parts.push(`${cards} card${cards === 1 ? '' : 's'}`)
  if (c.delivKeys.length) parts.push(`${c.delivKeys.length} channel${c.delivKeys.length === 1 ? '' : 's'}`)
  // Posts NOT under a copied channel. A channel already accounts for its own, and counting them
  // twice makes a two-card copy read as six things.
  const loose = c.rows.filter((r) => !c.delivKeys.includes(deliverableKeyFor(r))).length
  if (loose) parts.push(`${loose} post${loose === 1 ? '' : 's'}`)
  if (!parts.length) return 'nothing'
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** The brief is every board's root, so a wire into it is meaningful on any board it lands on. */
const BRIEF = 'campaign'

export interface PastedObjects {
  objects: CanvasObject[]
  placements: SmartPlacement[]
  connectors: { from: string; to: string }[]
  pos: Record<string, { x: number; y: number }>
  groups: CardGroup[]
  /** Old id → new id, for the caller that needs to select what it just pasted. */
  idMap: Map<string, string>
  /** Cards whose record or smart-object link was dropped because the brand changed. */
  unlinked: number
}

/**
 * CLONE THE COPIED CARDS FOR THE BOARD THEY ARE LANDING ON.
 *
 * @param origin where the top-left of the pasted arrangement should sit, in stack coordinates. The
 *   RELATIVE offsets between cards are preserved and the whole set is translated, because the
 *   arrangement is most of what was worth copying: three cards feeding a brief are a shape, and
 *   pasting them as a pile in the corner throws away the part that took the work.
 * @param knownSmartObjectIds the smart objects the TARGET can resolve. A placement whose object is
 *   not among them cannot be drawn — see the note on `unlinked` below.
 * @param liveTargets deliverable keys and row ids that already exist on the target board, so a wire
 *   from a card to a channel survives when the target has that channel too.
 * @param outputMap what a copied channel is CALLED on the target board (see pasteRows' keyMap). A
 *   deliverable key is derived from the channel, the type and the asset it branches off, and the
 *   third of those can be dropped by the paste — so the channel a wire pointed at can legitimately
 *   arrive under a different name, and without this the wire would be dropped as dangling.
 */
export function pasteObjects(
  clip: CanvasClipboard,
  opts: {
    /** The brand in scope on the board being pasted into. */
    toBrand: string
    origin: { x: number; y: number }
    knownSmartObjectIds: ReadonlySet<string>
    liveTargets: ReadonlySet<string>
    outputMap: ReadonlyMap<string, string>
  },
): PastedObjects {
  /**
   * A DIFFERENT BRAND'S RECORDS DO NOT TRAVEL.
   *
   * A card's refId names a record in a brand's library — an audience, a proof point, a product —
   * and those libraries are per brand. Carrying the id across would put one client's segment on
   * another client's board, feed it to the copy writer as that campaign's audience, and list it in
   * the inspector as an established record of a brand it has never belonged to. That is the same
   * leak canvasBrandScope refuses, arriving by a different door.
   *
   * What the PERSON put on the card still travels: its name, its note, the direction typed into it
   * and any document uploaded onto it. Those are authored on the card, not borrowed from a library,
   * and a card that arrives with its instructions intact and its record left to pick is a card that
   * saved the work worth saving. An empty card would not be.
   *
   * A brandless canvas ('' — no single brand in scope) is treated as a crossing in both directions,
   * because a record picked under one brand has no meaning on a board that is under none.
   */
  const crossBrand = clip.fromBrand !== opts.toBrand

  const idMap = new Map<string, string>()
  let unlinked = 0

  const objects: CanvasObject[] = clip.objects.map((o) => {
    const id = freshObjectId()
    idMap.set(o.id, id)
    const next: CanvasObject = { ...o, id }
    if (crossBrand && (next.refId || next.smartObjectId)) {
      unlinked++
      delete next.refId
      delete next.smartObjectId
    } else if (next.smartObjectId && !opts.knownSmartObjectIds.has(next.smartObjectId)) {
      // Same brand, but the object has since been deleted from the library. pruneBoard would clear
      // this on the next load anyway; clearing it here means the card never draws as linked to
      // something that is not there.
      unlinked++
      delete next.smartObjectId
    }
    return next
  })

  /**
   * A PLACEMENT ONLY SURVIVES IF ITS SMART OBJECT DOES.
   *
   * A placement is a brand-library object shown on this board, so it is the one thing in a copy that
   * cannot be cloned: the object it draws lives in a library the target may not have. Rather than
   * paste a frame around nothing, the placement is dropped and its MEMBER CARDS are pasted as plain
   * cards — which is what "Release" does to a placement on purpose, and is the outcome that loses
   * the least. The cards were always the content; the placement was the wrapper.
   */
  const placements: SmartPlacement[] = []
  /**
   * ...AND ITS WIRES GO TO THOSE CARDS, or the paste lands them attached to nothing.
   *
   * The paragraph above is the whole reason a dropped placement is not a loss: the cards are the
   * content and they are pasted. But the placement carried the WIRE — you wire the object, not the
   * cards in it — and its id maps to nothing in the target board, so `endpoint` returned null and
   * every edge touching it was discarded. The member cards arrived on the far board loose and
   * unattached, which for a cross-brand paste is every single time.
   *
   * Same rule pruneBoard uses when the library object behind a placement is deleted: the members
   * inherit the edges the wrapper was carrying.
   */
  const heirs = new Map<string, string[]>()
  for (const p of clip.placements) {
    if (crossBrand || !opts.knownSmartObjectIds.has(p.smartObjectId)) {
      unlinked++
      const members = p.memberIds.map((m) => idMap.get(m)).filter((m): m is string => !!m)
      if (members.length) heirs.set(p.id, members)
      continue
    }
    const id = freshPlacementId()
    idMap.set(p.id, id)
    placements.push({
      id,
      smartObjectId: p.smartObjectId,
      memberIds: p.memberIds.map((m) => idMap.get(m)).filter((m): m is string => !!m),
    })
  }

  /**
   * WHERE AN ENDPOINT LANDS.
   *
   * A copied card gets its new id. The brief is the board's root and exists on every board, so a
   * wire into it is kept as-is — which is the single most useful thing a paste carries, since a card
   * wired to the brief is the difference between a campaign that can be written from and one that
   * refuses to Generate. A channel or post endpoint is kept when the target has it (or is about to,
   * in this same paste). Anything else is dropped rather than left pointing at nothing.
   */
  const endpoint = (e: string): string | null => {
    if (e === BRIEF) return BRIEF
    const mapped = idMap.get(e) ?? opts.outputMap.get(e)
    if (mapped) return mapped
    return opts.liveTargets.has(e) ? e : null
  }
  const connectors: { from: string; to: string }[] = []
  const seenEdge = new Set<string>()
  for (const c of clip.connectors) {
    // A dropped placement hands its endpoint to each of its pasted cards; everything else resolves
    // to the single id it landed on.
    for (const from of heirs.get(c.from) ?? [endpoint(c.from)]) {
      for (const to of heirs.get(c.to) ?? [endpoint(c.to)]) {
        // A wire from the brief to the brief is what two dropped endpoints collapse into. It is not a
        // connection anybody drew, and it would draw a loop on the root card. A member wired to its
        // own container collapses the same way.
        if (!from || !to || from === to) continue
        // NUL rather than a space or a colon: a deliverable key can carry an asset name
        // (`email|nurture|↳Launch film`), so both of those appear inside real ids and would let two
        // different pairs collapse to one key. Same delimiter as cardTrail's edgeKey, written as an
        // escape so the file stays greppable.
        const key = `${from}\u0000${to}`
        if (seenEdge.has(key)) continue
        seenEdge.add(key)
        connectors.push({ from, to })
      }
    }
  }

  /**
   * ONLY CARDS CARRY THEIR POSITION.
   *
   * An object card is absolutely placed and `pos` IS where it sits, so translating the set keeps the
   * arrangement. A channel or a post sits in the board's flow column and `pos` is only a NUDGE off
   * that flow position — a nudge measured against the source board's layout, which the target board
   * does not share. Applying it there would offset a card from a different starting point and
   * scatter exactly the cards that were never hand-placed to begin with. Channels land where this
   * board puts them.
   *
   * Translate rather than reproduce the absolute coordinates, so a paste lands where the caller
   * asked for it and still looks like what was copied.
   */
  const copied = [...idMap.keys()].map((k) => clip.pos[k]).filter(Boolean)
  const minX = copied.length ? Math.min(...copied.map((p) => p.x)) : 0
  const minY = copied.length ? Math.min(...copied.map((p) => p.y)) : 0
  const pos: Record<string, { x: number; y: number }> = {}
  for (const [oldId, newId] of idMap) {
    const p = clip.pos[oldId]
    if (!p) continue
    pos[newId] = { x: opts.origin.x + (p.x - minX), y: opts.origin.y + (p.y - minY) }
  }

  // A group frames cards on THIS canvas, so it comes along when the cards do. Members that were not
  // copied are dropped, and a group left holding fewer than two cards dissolves rather than framing
  // a single card — the same rule pruneGroups applies everywhere else.
  const groups: CardGroup[] = []
  for (const g of clip.groups) {
    const ids = g.ids.map((i) => idMap.get(i)).filter((i): i is string => !!i)
    if (ids.length >= MIN_GROUP) groups.push({ id: `cg_${Date.now().toString(36)}_${groups.length}`, name: g.name, ids })
  }

  return { objects, placements, connectors, pos, groups, idMap, unlinked }
}

/**
 * Ids must be unique across sessions, and the store's own minter is private to it. Same shape, so
 * nothing downstream can tell a pasted row from a seeded one — no reader parses a row id, and one
 * that started to would be the bug.
 */
const freshRowId = (): string => `row_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`

/**
 * A NAME NOTHING IN THE TARGET CAMPAIGN ALREADY ANSWERS TO.
 *
 * Assets are linked to each other BY NAME — branchOf, linksTo and variantOf all name an asset rather
 * than pointing at its id — so two assets sharing a name in one campaign is not a cosmetic clash: it
 * makes every one of those links ambiguous, and the canvas draws the journey edge to whichever it
 * finds first. Pasting into the campaign a thing came from is the common way to reach that state.
 */
function uniqueName(desired: string, taken: Set<string>): string {
  if (!taken.has(desired)) {
    taken.add(desired)
    return desired
  }
  for (let n = 2; ; n++) {
    const candidate = `${desired} (${n})`
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
  }
}

export interface PastedRows {
  rows: TrafficRow[]
  /** Rows whose audience or record tags were dropped because the brand changed. */
  unlinked: number
  /**
   * The deliverable key each copied channel arrives under, old → new.
   *
   * Usually the same key: it is derived from the channel and the asset type, and neither changes in
   * a paste. It differs when the channel branched off an asset that did NOT come along, because the
   * key carries that parent (see deliverableKeyFor) and the link is dropped rather than left
   * pointing at a stranger. The wire from a card to that channel is remapped through this, so the
   * channel arriving under a new name does not silently lose what was pointed at it.
   */
  keyMap: Map<string, string>
}

/**
 * BUILD THE ASSETS A PASTED CHANNEL IS MADE OF.
 *
 * ASSEMBLED FROM AN ALLOW-LIST, field by field, rather than by copying the row and deleting what
 * must not travel. A TrafficRow carries two unlike things: the PLAN (what this asset is, who it is
 * for, what it says, when it goes out) and the RECORD OF WHAT HAPPENED to it (what it cost, what it
 * earned, when it was approved, when it was posted, the URL it was published at). Only the plan is
 * being copied. A pasted asset that arrived carrying the original's impressions would be a draft
 * claiming an audience it never reached, and reconciledAt would make the tool believe those numbers
 * had been measured against it.
 *
 * The allow-list is the point: a field added to TrafficRow later does NOT travel until somebody adds
 * it here and decides which of the two it is. The same reasoning saveFlowBoard rebuilds a board
 * field by field for, and for the same reason — the failure is silent in both directions, and the
 * safe silence is the one where a new field stays behind.
 *
 * @param anchorDay when set, the whole set is moved forward by a whole number of DAYS, enough to put
 *   the earliest asset on this day. A cadence laid out over one flight arrives as the same cadence
 *   rather than as a set of dates from another campaign's calendar (in the past, as often as not).
 *
 *   WHOLE DAYS, not "move the earliest to this instant". Anchoring to a moment moved every asset to
 *   whatever time of day the anchor happened to be — three posts written for 10am arrived scheduled
 *   for midnight, which is a worse answer than the wrong date was. Each asset keeps its own day
 *   offset and its own clock time, so a 10am post stays a 10am post.
 */
export function pasteRows(
  rows: readonly TrafficRow[],
  opts: {
    campaign: string
    /** '' when the target canvas has no single brand — see the crossBrand note in pasteObjects. */
    sameBrand: boolean
    /** Every asset name already in the target campaign. */
    takenNames: ReadonlySet<string>
    anchorDay: number | null
  },
): PastedRows {
  if (!rows.length) return { rows: [], unlinked: 0, keyMap: new Map() }

  const taken = new Set(opts.takenNames)
  // Ordered by schedule so the anchor moves the EARLIEST asset and the rest follow it, and so the
  // "(2)" suffixes land in the order a person reads the channel in.
  const ordered = [...rows].sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''))
  const earliest = ordered.reduce((min, r) => {
    const t = Date.parse(r.scheduledAt || '')
    return Number.isFinite(t) ? Math.min(min, t) : min
  }, Number.POSITIVE_INFINITY)
  /** Local midnight of whatever day this instant falls on. */
  const midnight = (t: number): number => {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  /**
   * Whole days between two instants, counted in local calendar days. Rounded because a day spanning
   * a daylight-saving change is 23 or 25 hours long, and dividing by 24 would come out fractional.
   */
  const daysBetween = (a: number, b: number): number => Math.round((midnight(b) - midnight(a)) / 86_400_000)
  const shifting = opts.anchorDay !== null && Number.isFinite(earliest)
  /**
   * REBUILT DAY BY DAY rather than moved by a fixed number of milliseconds.
   *
   * A fixed offset is only right for the asset it was measured from: add 31 days' worth of
   * milliseconds to an asset on the far side of a daylight-saving change and it lands an hour off the
   * time it was written for. Taking each asset's own day offset and its own clock time, and building
   * the date from those parts, keeps both exactly — a 9am post stays a 9am post, in March and in
   * November.
   */
  const moved = (iso: string | undefined): string | undefined => {
    if (!iso) return undefined
    const t = Date.parse(iso)
    if (!Number.isFinite(t)) return iso
    if (!shifting) return iso
    const src = new Date(t)
    const anchor = new Date(opts.anchorDay as number)
    return new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() + daysBetween(earliest, t),
      src.getHours(),
      src.getMinutes(),
      src.getSeconds(),
      src.getMilliseconds(),
    ).toISOString()
  }

  // Built before the rows are, because a link is rewritten to the name its target ENDED UP with, and
  // a later asset can link back to an earlier one.
  const renamed = new Map<string, string>()
  for (const r of ordered) renamed.set(r.assetName, uniqueName(r.assetName, taken))

  /**
   * A LINK ONLY SURVIVES INSIDE THE COPY.
   *
   * branchOf, linksTo and variantOf name an asset, and a name that was not copied means one of two
   * things in the target campaign: nothing at all, or — far worse — a DIFFERENT asset that happens
   * to be called the same. The second is how a pasted post silently branches off a stranger. So a
   * link is rewritten when its target came along, and dropped when it did not.
   */
  const link = (name: string | undefined): string | undefined => (name ? renamed.get(name) : undefined)

  let unlinked = 0
  const keyMap = new Map<string, string>()
  const out: TrafficRow[] = ordered.map((r) => {
    const next: TrafficRow = {
      id: freshRowId(),
      // Minted by the sheet on append, the same as every seeded asset.
      assetId: '',
      assetName: renamed.get(r.assetName) ?? r.assetName,
      mediaType: r.mediaType,
      channel: r.channel,
      campaign: opts.campaign,
      messaging: { ...r.messaging },
      // A paste is a plan, whatever the original had become. An asset copied out of a campaign that
      // shipped arrives as a draft, not as something already approved and posted here.
      status: 'draft',
      scheduledAt: moved(r.scheduledAt) ?? r.scheduledAt,
      createdAt: Date.now(),
    }
    if (r.assetType) next.assetType = r.assetType
    if (r.funnelStage) next.funnelStage = r.funnelStage
    if (r.body) next.body = r.body
    if (r.format) next.format = r.format
    if (r.rtbMap) next.rtbMap = { ...r.rtbMap }
    if (r.ctas?.length) next.ctas = r.ctas.map((c) => ({ ...c }))
    if (r.lineage) next.lineage = { ...r.lineage }
    // Who wrote this copy stays true of the copy, which travelled verbatim.
    if (r.copySource) next.copySource = r.copySource
    if (r.copyAt) next.copyAt = r.copyAt
    const ends = moved(r.endsAt)
    if (ends) next.endsAt = ends
    /**
     * The planned spend travels; the flight END does not. A lifetime budget means "this much over
     * the run", which is still true wherever it lands, but endDate is a date in the campaign it came
     * from and would run this asset to a deadline nobody set here.
     */
    if (r.budget) next.budget = { amount: r.budget.amount, type: r.budget.type }
    // Who this is written to, and the records pinned to it, are a brand's own. Same rule as a card's
    // refId, and the same reason.
    if (opts.sameBrand) {
      if (r.audience) next.audience = r.audience
      if (r.references?.length) next.references = r.references.map((ref) => ({ ...ref }))
    } else if (r.audience || r.references?.length) {
      unlinked++
    }
    const branch = link(r.branchOf)
    if (branch) next.branchOf = branch
    const to = link(r.linksTo)
    if (to) next.linksTo = to
    const variant = link(r.variantOf)
    if (variant) next.variantOf = variant
    // Built from the row it is now — its own channel, its own campaign — rather than carried over
    // from the campaign it was copied out of, which is what the tracking link would have reported.
    next.utm = buildUtm(next)
    keyMap.set(deliverableKeyFor(r), deliverableKeyFor(next))
    return next
  })

  return { rows: out, unlinked, keyMap }
}
