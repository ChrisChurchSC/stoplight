import { deliverableKeyFor, type CanvasObject, type CanvasObjectKind, type FlowBoard } from './flowBoard'
import { upstreamCardIds } from './boardResolve'

/**
 * THE CARDS THAT REACH ONE ASSET, by kind.
 *
 * The canvas answers "what is this post written from" by having you look at it: the lines run from a
 * Brand card and a Message card and a Voice card into the brief, and from the brief down to the
 * post. The grid could not answer it at all. It listed the copy and the schedule and the budget, and
 * said nothing about the thing that decided what the copy SAYS, so the two surfaces were describing
 * different halves of the same asset.
 *
 * Three routes reach an asset, and this walks all three in the order the resolver does: wired
 * straight into the row, into its channel, or into the campaign every asset inherits. A channel cut
 * off from the brief skips the third, for the same reason it takes none of the campaign's
 * instructions — the picture and the writing have to agree, and here the grid IS the picture.
 *
 * `nameFor` is passed in rather than resolved here. A card names a record in one of a dozen
 * collections that live in the store, and a domain module has no business reaching for those; the
 * caller knows how to turn a card into a word.
 */
export interface RowCard {
  id: string
  kind: CanvasObjectKind
  /** The record this card names, when it names one. */
  refId?: string
  label: string
  /**
   * The uploaded document this card carries, by file name. A card is given its context by picking
   * a record OR by handing it a .md, and the second one travels to the writer on the same terms
   * (see wiredCardDocsFor) — so a reader deciding whether a card contributes anything has to be
   * able to see it, or a card doing real work reads as holding nothing.
   */
  doc?: string
}

export function cardsForRow(
  board: FlowBoard,
  row: { id: string; channel: string; assetType?: string; branchOf?: string },
  nameFor: (o: CanvasObject) => string,
): RowCard[] {
  const objectById = new Map(board.objects.map((o) => [o.id, o]))
  const placementById = new Map(board.placements.map((p) => [p.id, p]))
  const delivKey = deliverableKeyFor(row)
  const cut = (board.detached ?? []).includes(delivKey)
  const targets = cut ? [row.id, delivKey] : [row.id, delivKey, 'campaign']

  const seen = new Set<string>()
  const out: RowCard[] = []
  const push = (o: CanvasObject) =>
    out.push({
      id: o.id,
      kind: o.kind,
      refId: o.refId,
      label: nameFor(o),
      doc: o.reference?.text.trim() ? o.reference.name : undefined,
    })
  for (const t of targets) {
    for (const id of upstreamCardIds(board, t)) {
      if (seen.has(id)) continue
      seen.add(id)
      /**
       * A PLACEMENT IS A BAG OF CARDS, AND THE BAG IS WHAT CARRIES THE WIRE.
       *
       * You wire the smart object, not the cards inside it, so its members have no edge of their
       * own and the upstream walk stops at the placement. This used to read `objectById.get(id)`
       * and skip whatever it did not find, under a comment claiming upstreamCardIds returned the
       * members separately. It does not — it returns the placement id and nothing else — so every
       * card inside a smart object was invisible to the grid: Made from showed no audience for an
       * asset whose audience was reaching the copy writer through that very object, and the column
       * exists precisely to say what the copy is written from.
       *
       * wiredRefsFor has always resolved a placement to the records inside it (see refsOf). This is
       * the same rule for the cards, so the two stop disagreeing.
       */
      const placed = placementById.get(id)
      if (placed) {
        for (const m of placed.memberIds) {
          if (seen.has(m)) continue
          seen.add(m)
          const mo = objectById.get(m)
          if (mo) push(mo)
        }
        continue
      }
      const o = objectById.get(id)
      if (!o) continue
      push(o)
    }
  }
  return out
}
