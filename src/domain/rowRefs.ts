import type { FlowReference } from './clients'

/**
 * WHAT ONE ASSET ENDS UP POINTING AT when a card is wired to something that covers it.
 *
 * Wiring a card to a channel materializes its records onto every asset in that channel, rather than
 * being resolved from the board at draft time (see attachToTarget for why). The rule that makes that
 * safe is the one this module exists to hold: **each asset starts from its OWN references**.
 *
 * It used to start from `rows.find(r => r.references?.length)?.references` — the first asset in the
 * group that had an override — and write that one array to all of them. So a pattern pinned to post
 * #2 alone was copied onto #1 and #3 the moment any card was wired to their shared channel, and the
 * grid then read those rows as "made from" a record the canvas showed no wire for. The two surfaces
 * disagreed, and the grid was the one that was wrong, because the leak had been written to the data.
 *
 * An asset with no override of its own inherits `campaignRefs`, which is what the copy resolver does
 * with it too (`r.references?.length ? poolsFrom(r.references) : campaignPools`). Materializing that
 * inheritance is what turns it into an override, which is correct: the asset now carries a card the
 * campaign does not.
 *
 * Deduped by type+id, never by label: the same record reached two ways is one record, and labels go
 * stale when a record is renamed.
 */
const same = (a: FlowReference, b: FlowReference): boolean => a.type === b.type && a.id === b.id

/** One asset's references after `add` is wired to it. Its own override wins as the base. */
export function withRefs(
  own: FlowReference[] | undefined,
  campaignRefs: FlowReference[],
  add: FlowReference[],
): FlowReference[] {
  const next = [...(own && own.length ? own : campaignRefs)]
  for (const r of add) if (!next.some((x) => same(x, r))) next.push(r)
  return next
}

/**
 * One asset's references after `drop` is unwired from it.
 *
 * Same base rule, and the same reason: filtering one asset's array and writing it to its siblings
 * would delete pins those siblings alone carried, which is the mirror of the leak above and reads as
 * records silently vanishing from assets nobody touched.
 */
export function withoutRefs(
  own: FlowReference[] | undefined,
  campaignRefs: FlowReference[],
  drop: FlowReference[],
): FlowReference[] {
  return [...(own && own.length ? own : campaignRefs)].filter((x) => !drop.some((d) => same(d, x)))
}
