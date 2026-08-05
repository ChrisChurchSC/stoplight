import type { FlowReference } from './clients'

/**
 * WHAT ONE ASSET ENDS UP POINTING AT when something that covers it is edited.
 *
 * Wiring a card to a channel, or editing that channel's records in the inspector, materializes the
 * result onto every asset under it rather than being resolved from the board at draft time (see
 * attachToTarget for why). The rule that makes that safe is the one this module exists to hold:
 * **each asset starts from its OWN references**.
 *
 * Every writer here used to start from `rows.find(r => r.references?.length)?.references` — the
 * first asset in the group that had an override — and write that one array to all of them. So a
 * pattern pinned to post #2 alone was copied onto #1 and #3 the moment anything touched their shared
 * channel, and the grid then read those rows as "made from" a record the canvas showed no wire for.
 * The two surfaces disagreed, and the grid was the one that was wrong, because the leak had been
 * written to the data.
 *
 * An asset with no override of its own inherits `campaignRefs`, which is what the copy resolver does
 * with it too (`r.references?.length ? poolsFrom(r.references) : campaignPools`). Materializing that
 * inheritance is what turns it into an override, which is correct: the asset now carries something
 * the campaign does not.
 *
 * Deduped by type+id, never by label: the same record reached two ways is one record, and labels go
 * stale when a record is renamed.
 */
const same = (a: FlowReference, b: FlowReference): boolean => a.type === b.type && a.id === b.id

/**
 * One asset's references after `add` is applied and `drop` removed.
 *
 * ONE function rather than a compose of the two wrappers below, because the base has to be resolved
 * exactly once. Chaining them re-asks "does this row have an override?" against the intermediate
 * result, so a row whose last record was just dropped answers no and silently re-inherits the whole
 * campaign set it had only just been cleared of.
 */
export function editRefs(
  own: FlowReference[] | undefined,
  campaignRefs: FlowReference[],
  ops: { add?: FlowReference[]; drop?: FlowReference[] },
): FlowReference[] {
  const base = own && own.length ? own : campaignRefs
  const next = base.filter((x) => !(ops.drop ?? []).some((d) => same(d, x)))
  for (const a of ops.add ?? []) if (!next.some((x) => same(x, a))) next.push(a)
  return next
}

/** One asset's references after `add` is wired to it. Its own override wins as the base. */
export const withRefs = (
  own: FlowReference[] | undefined,
  campaignRefs: FlowReference[],
  add: FlowReference[],
): FlowReference[] => editRefs(own, campaignRefs, { add })

/**
 * One asset's references after `drop` is unwired from it.
 *
 * Same base rule, and the same reason: filtering one asset's array and writing it to its siblings
 * would delete pins those siblings alone carried, which is the mirror of the leak above and reads as
 * records silently vanishing from assets nobody touched.
 */
export const withoutRefs = (
  own: FlowReference[] | undefined,
  campaignRefs: FlowReference[],
  drop: FlowReference[],
): FlowReference[] => editRefs(own, campaignRefs, { drop })

/**
 * WHAT EVERY ASSET IN A GROUP IS WRITTEN FROM: the intersection of their effective sets.
 *
 * This is what a channel's record editor should show, and showing the first row that happened to
 * carry an override is the READOUT half of the same bug: one asset's private pin presented as a fact
 * about the channel, with an editor attached that would then write it to the rest of them.
 *
 * A record only some assets carry belongs to those assets, and the grid's Made-from column is where
 * it is visible per asset. An empty group inherits the campaign, having nothing to disagree about.
 */
export function sharedRefs(
  rows: { references?: FlowReference[] }[],
  campaignRefs: FlowReference[],
): FlowReference[] {
  if (!rows.length) return campaignRefs
  const sets = rows.map((r) => (r.references && r.references.length ? r.references : campaignRefs))
  return sets[0].filter((ref) => sets.every((s) => s.some((x) => same(x, ref))))
}
