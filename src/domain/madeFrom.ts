import { REF_TYPE_FOR_OBJECT_KIND, type CanvasObjectKind } from './flowBoard'
import type { FlowReference } from './clients'
import type { RowCard } from './cardsForRow'

/**
 * WHAT ONE ASSET IS MADE FROM, as a list rather than as a grid of kinds.
 *
 * The sheet used to give every object kind its own column — a Brand column, a Voice column, a Season
 * column, twelve of them — so the question "what is this post written from" was answered by reading
 * sideways across two screens of mostly empty cells. This flattens the same answer into the entries
 * one asset actually has, in registry order, which is what the "Made from" column renders.
 *
 * The order of resolution is the writer's own, and it matters: the row's own pin beats a card wired
 * into it, because that is the order the copy resolver reads them in. A cell that showed the board's
 * answer while the writer used the pin would be a readout disagreeing with the thing it reads.
 *
 * `nameOf` is passed in for the same reason cardsForRow takes it: a record id means nothing without
 * the dozen collections it might live in, and those live in the store, not here.
 */
export interface MadeFromEntry {
  kind: CanvasObjectKind
  /** The record named, when one is named. Absent on a card that has picked nothing yet. */
  refId?: string
  /** What to show. Empty when nothing is picked — the caller says so in its own words. */
  label: string
  /** The card behind this entry, when a card is behind it. */
  cardId?: string
  /**
   * Is this the entry the kind's picker sets? One per kind at most: the one the writer resolves to.
   * The rest are other cards of the same kind reaching the same asset — real, and read-only here,
   * because a picker that set one of them would silently be setting the primary instead.
   */
  primary: boolean
}

export function madeFrom(args: {
  /** Which kinds to consider, in the order they should read. */
  kinds: CanvasObjectKind[]
  /** Cards reaching this asset, from cardsForRow. */
  cards: RowCard[]
  /** The asset's own pins, which override the board. */
  references?: FlowReference[]
  /**
   * The brand the campaign is bound to. Brand carries no FlowRefType and is not per asset: it is the
   * campaign's OWNER, so it is handed in already resolved rather than looked for among the pins.
   *
   * Its callers resolve it by matching `row.client` against brand records BY NAME, which is a string
   * comparison across two slices and fails quietly in every way a string comparison can: a row whose
   * client was never set, a brand renamed after the rows were made, a stray space. That is why the
   * card below is a fallback rather than a nicety.
   */
  brandRefId?: string
  /**
   * THE AUDIENCE THE ROW ITSELF NAMES, when no card and no pin name one.
   *
   * Audience is the only kind with a plain-string mirror on the asset — `row.audience` — and half
   * the app writes it: the campaign canvas sets it from the asset inspector, seeding picks the
   * brand's first segment, ingest classifies into it. None of those mint a reference or a card,
   * because the string IS the field they are setting. So an asset can plainly carry an audience,
   * be shown under it on the canvas, and have nothing here for this column to find.
   *
   * `refId` is the segment that name resolves to, when it resolves to one, so the chip is a real
   * entry the picker can change rather than a dead label. It is absent for an audience typed or
   * ingested as a name the library has no record of — which is a true thing to say about the row,
   * and better said than left blank.
   *
   * A CARD STILL WINS, which is the opposite of brand above and right for the same reason: the
   * binding is brand's most specific answer, and a wire is audience's. This is the fallback for
   * when nothing was wired at all.
   */
  rowAudience?: { refId?: string; label: string }
  nameOf: (kind: CanvasObjectKind, refId: string) => string | undefined
}): MadeFromEntry[] {
  const { kinds, cards, references, brandRefId, rowAudience, nameOf } = args
  const out: MadeFromEntry[] = []

  for (const kind of kinds) {
    const mine = cards.filter((c) => c.kind === kind)
    const type = REF_TYPE_FOR_OBJECT_KIND[kind]
    const pinned = type ? (references ?? []).find((r) => r.type === type) : undefined
    /**
     * BRAND FALLS BACK TO THE WIRED CARD, like every other kind falls back to its own.
     *
     * It used to be `brandRefId ?? ''` and nothing else, so an asset whose `client` resolved to no
     * brand record read as "No brand picked" while a Brand card sat on the canvas naming one and
     * wired into the brief. The brand was not missing — it was on the board, in the copy, and in
     * the campaign — and the grid was the only surface saying otherwise. The card then turned up
     * again further down the same cell under "Also reaching this asset", which is the tell: the
     * entry knew about the card and had already refused to let it be the answer.
     *
     * The binding still wins where there is one. It is the campaign's owner and the thing
     * bindCampaignBrand writes; the card is what to believe when that lookup comes back empty.
     */
    const chosen = kind === 'brand'
      ? brandRefId || mine.find((c) => c.refId)?.refId || ''
      : pinned?.id || mine.find((c) => c.refId)?.refId || ''

    if (chosen) {
      const card = mine.find((c) => c.refId === chosen)
      out.push({
        kind,
        refId: chosen,
        // The pin carries the label it was written with, which is the answer when the record has
        // since been renamed out from under it or lives in a collection this brand cannot see.
        label: nameOf(kind, chosen) ?? pinned?.label ?? card?.label ?? '',
        cardId: card?.id,
        primary: true,
      })
    } else if (mine.length) {
      // Connected and holding nothing. It still shows, because a wired card with no record picked is
      // reaching the writer with nothing, and that is the gap this column exists to make visible.
      out.push({ kind, label: '', cardId: mine[0].id, primary: true })
    } else if (kind === 'audience' && rowAudience?.label) {
      // Nothing wired, but the row names one anyway. No cardId: there is no card to open, and
      // claiming one would send the inspector after a card that does not exist.
      out.push({ kind, refId: rowAudience.refId, label: rowAudience.label, primary: true })
    }

    // Everything else of this kind that reaches the asset. Deduped by record: two Voice cards naming
    // the same voice are one voice arriving twice, and listing it twice would read as two.
    const seen = new Set(chosen ? [chosen] : [])
    for (const c of mine) {
      if (!c.refId || seen.has(c.refId)) continue
      seen.add(c.refId)
      out.push({ kind, refId: c.refId, label: nameOf(kind, c.refId) ?? c.label, cardId: c.id, primary: false })
    }
  }

  return out
}
