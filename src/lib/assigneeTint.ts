/**
 * A colour per person for the Assigned-to column.
 *
 * The shared `recordTint` could not do this job. It hashes a string by SUMMING its character codes
 * into seven colours, so it collides constantly and blindly: "Laura" and "Ryan" both sum into slot
 * 4 and come out the same yellow, as do "Jordan" and "Casey". On a column whose whole purpose is
 * telling people apart, two owners in one colour is the one outcome that must not happen. And every
 * one of those seven tints fails contrast against the white initial drawn on it — best 3.26:1,
 * worst 1.92:1, against a 4.5:1 bar.
 *
 * ── Why colours are REMEMBERED rather than computed from the name ──
 *
 * "Always the same colour for the same person" and "always the most scannable spread" pull against
 * each other, and only one of them can win. Deriving the colour from the name is perfectly stable
 * but cannot spread anything: whoever the three people happen to be is whatever three colours their
 * names hash to, adjacent or not. Spreading the colours over whoever is present means the colours
 * MOVE when somebody joins, and a column people navigate by colour is exactly where that is worst.
 *
 * So the colour is decided once, on first sight of a name, and then kept. New names take the next
 * colour in an order built so that any prefix of it is as spread as it can be — two people land
 * 159.6 apart in Lab, three 92.5, where handing them out in palette order gives 42.0 for both. It
 * is stable because it is remembered, and spread because of the order it is remembered in.
 *
 * The trade is that a name's colour depends on when it first appeared rather than on its letters,
 * so the same team can hold different colours in two browsers with no backend. With Supabase
 * configured, persistState mirrors the map to the workspace and everyone sees the same thing.
 */

/**
 * Twelve tints, in max-spread order — a farthest-point traversal in CIELAB, so taking the first N
 * gives the most separable N the palette can offer. Every one clears 4.5:1 against the white
 * initial drawn on it (measured; the lowest is 4.92).
 *
 * Do not reorder: this order IS the differentiation, and shuffling it silently makes small teams
 * harder to scan while changing nothing that a type or a test would notice.
 */
export const ASSIGNEE_TINTS = [
  '#4d7c0f', // olive    4.99
  '#6d28d9', // violet   7.10
  '#b91c1c', // red      6.47
  '#0369a1', // sky      5.93
  '#0f766e', // teal     5.47
  '#a16207', // amber    4.92
  '#be185d', // pink     6.04
  '#a21caf', // fuchsia  6.32
  '#1d4ed8', // blue     6.70
  '#78350f', // brown    9.07
  '#475569', // slate    7.58
  '#15803d', // green    5.02
] as const

/**
 * v2 because the KEY has to track the logic that filled it. v1 was written while the palette was in
 * an arbitrary order, so its remembered choices are remembered mistakes — a two-person workspace
 * holding olive and green, the closest pair in the palette, purely because those were slots 1 and 4
 * at the time. Remembering is the whole point, so there is no repair to do in place: the old
 * assignments were decided by different rules and are worth nothing. Start clean.
 */
export const ASSIGNEE_TINT_KEY = 'stoplight.assigneeTint.v2'

export type TintStore = Record<string, string>

export const loadTintStore = (): TintStore => {
  try {
    const raw = JSON.parse(localStorage.getItem(ASSIGNEE_TINT_KEY) ?? '{}')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as TintStore) : {}
  } catch {
    return {}
  }
}

/**
 * Colours for `names`, given the ones already handed out. Pure — it returns the store it would like
 * written rather than writing it, so resolving during a render stays free of side effects.
 *
 * `changed` says whether anything new was decided, which is the caller's cue to persist. Without it
 * every render would write an identical object back and loop.
 */
export function assignTints(
  names: readonly string[],
  stored: TintStore,
): { tints: Map<string, string>; store: TintStore; changed: boolean } {
  const store: TintStore = { ...stored }
  const valid = new Set<string>(ASSIGNEE_TINTS)
  // Colours already spoken for — by anyone, not only the names being asked about, so somebody who
  // is briefly unassigned does not lose their colour to the next person along.
  const used = new Set(Object.values(store).filter((c) => valid.has(c)))
  const tints = new Map<string, string>()
  let changed = false

  for (const name of names) {
    let colour = store[name]
    if (!colour || !valid.has(colour)) {
      // Next unused in max-spread order. Past twelve people the palette is exhausted and colours
      // repeat — with more owners than colours something has to give, and repeating beats running
      // out of chips.
      colour = ASSIGNEE_TINTS.find((t) => !used.has(t)) ?? ASSIGNEE_TINTS[used.size % ASSIGNEE_TINTS.length]
      store[name] = colour
      changed = true
    }
    used.add(colour)
    tints.set(name, colour)
  }
  return { tints, store, changed }
}

/** Carry a colour across a rename, so correcting a typo does not recolour the person. */
export function renameTint(stored: TintStore, from: string, to: string): TintStore {
  if (!stored[from] || from === to) return stored
  const next = { ...stored }
  // Only if the new name has none of its own — an existing person keeps theirs.
  if (!next[to]) next[to] = next[from]
  delete next[from]
  return next
}
