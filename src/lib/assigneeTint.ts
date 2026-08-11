/**
 * A colour per person for the Assigned-to column.
 *
 * The shared `recordTint` could not do this job. It hashes a string by SUMMING its character codes
 * into seven colours, so it collides constantly and blindly: "Laura" and "Ryan" both sum into slot
 * 4 and come out the same yellow, as do "Jordan" and "Casey", while "Sam" and "Alex" share another.
 * On a column whose whole purpose is telling people apart, two owners in the same colour is the one
 * outcome that must not happen. And every one of those seven tints fails contrast against the white
 * initial drawn on it — the best is 3.26:1, the worst 1.92:1, where 4.5:1 is the bar.
 *
 * So this is not a better hash. A hash cannot promise uniqueness, and the people in a workspace are
 * a small KNOWN set rather than an open one, which is what makes a promise possible: names are
 * assigned in a stable order, each takes its preferred slot, and anyone who finds it taken walks on
 * to the next free one. Unique up to the size of the palette, and stable — a name keeps its colour
 * as long as the set around it does not change.
 *
 * Every colour clears 4.5:1 against white text (measured; the lowest is 4.92) and the twelve are
 * spread around the wheel so neighbours in the list do not read as neighbours in hue.
 */

/** Measured white-on-tint contrast in comments; all clear the 4.5:1 that a 10px bold initial needs. */
export const ASSIGNEE_TINTS = [
  '#b91c1c', // red      6.47
  '#a16207', // amber    4.92
  '#4d7c0f', // olive    4.99
  '#15803d', // green    5.02
  '#0f766e', // teal     5.47
  '#0369a1', // sky      5.93
  '#1d4ed8', // blue     6.70
  '#6d28d9', // violet   7.10
  '#a21caf', // fuchsia  6.32
  '#be185d', // pink     6.04
  '#78350f', // brown    9.07
  '#475569', // slate    7.58
] as const

/** djb2. Order-sensitive, unlike a sum — "Ryan" and "Anry" should not want the same slot. */
const preferredSlot = (name: string): number => {
  let h = 5381
  for (const ch of name) h = ((h << 5) + h + ch.charCodeAt(0)) | 0
  return Math.abs(h) % ASSIGNEE_TINTS.length
}

/**
 * Colours for a set of names. Pass every name at once: the guarantee is about the SET, and can only
 * be made by seeing it whole. Feed it in a stable order (the caller sorts alphabetically) so the
 * same set always resolves the same way.
 *
 * Past twelve people the palette is exhausted and colours repeat — with more owners than colours
 * something has to give, and repeating is better than running out of chips.
 */
export function assigneeTints(names: readonly string[]): Map<string, string> {
  const taken = new Set<number>()
  const out = new Map<string, string>()
  for (const name of names) {
    let slot = preferredSlot(name)
    // Walk to the next free colour. Bounded by the palette, so it always terminates.
    for (let step = 0; step < ASSIGNEE_TINTS.length && taken.has(slot); step++) {
      slot = (slot + 1) % ASSIGNEE_TINTS.length
    }
    taken.add(slot)
    out.set(name, ASSIGNEE_TINTS[slot])
  }
  return out
}
