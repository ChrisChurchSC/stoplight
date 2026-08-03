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
   */
  brandRefId?: string
  nameOf: (kind: CanvasObjectKind, refId: string) => string | undefined
}): MadeFromEntry[] {
  const { kinds, cards, references, brandRefId, nameOf } = args
  const out: MadeFromEntry[] = []

  for (const kind of kinds) {
    const mine = cards.filter((c) => c.kind === kind)
    const type = REF_TYPE_FOR_OBJECT_KIND[kind]
    const pinned = type ? (references ?? []).find((r) => r.type === type) : undefined
    const chosen = kind === 'brand' ? (brandRefId ?? '') : pinned?.id || mine.find((c) => c.refId)?.refId || ''

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
