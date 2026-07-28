/**
 * ZIP CODES, RESOLVED OFFLINE.
 *
 * A persona's location wants to be typed as a ZIP — it is what people know, and it is five
 * keystrokes instead of guessing whether the answer is a town, a metro or a state. But a bare ZIP
 * is useless to a copy writer, which cannot be expected to know that 07740 is the Jersey Shore.
 *
 * So the ZIP is stored WITH the place it resolves to, and the resolution happens here, from a
 * bundled table rather than a lookup service. No network: this runs inside a published artifact and
 * behind a strict CSP, an offline dev session must behave identically to a live one, and a location
 * field that silently fails to resolve when a request is blocked is worse than one that never tried.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: resolve to a city. That needs a ~40k-row dataset to be
 * accurate, and a partial one would be confidently wrong for exactly the smaller places a persona is
 * most likely to name. State is derivable from the 3-digit prefix with a table small enough to read,
 * and "New Jersey" is enough for the writer to pitch register and reference weather, season and
 * distance correctly.
 */

/** US 3-digit ZIP prefix ranges, by state. Ordered; first match wins. */
const RANGES: { from: number; to: number; state: string }[] = [
  { from: 5, to: 5, state: 'New York' },
  { from: 6, to: 9, state: 'Puerto Rico & USVI' },
  { from: 10, to: 27, state: 'Massachusetts' },
  { from: 28, to: 29, state: 'Rhode Island' },
  { from: 30, to: 38, state: 'New Hampshire' },
  { from: 39, to: 49, state: 'Maine' },
  { from: 50, to: 59, state: 'Vermont' },
  { from: 60, to: 69, state: 'Connecticut' },
  { from: 70, to: 89, state: 'New Jersey' },
  { from: 100, to: 149, state: 'New York' },
  { from: 150, to: 196, state: 'Pennsylvania' },
  { from: 197, to: 199, state: 'Delaware' },
  { from: 200, to: 205, state: 'Washington DC' },
  { from: 206, to: 219, state: 'Maryland' },
  { from: 220, to: 246, state: 'Virginia' },
  { from: 247, to: 268, state: 'West Virginia' },
  { from: 270, to: 289, state: 'North Carolina' },
  { from: 290, to: 299, state: 'South Carolina' },
  { from: 300, to: 319, state: 'Georgia' },
  { from: 320, to: 349, state: 'Florida' },
  { from: 350, to: 369, state: 'Alabama' },
  { from: 370, to: 385, state: 'Tennessee' },
  { from: 386, to: 397, state: 'Mississippi' },
  { from: 398, to: 399, state: 'Georgia' },
  { from: 400, to: 427, state: 'Kentucky' },
  { from: 430, to: 459, state: 'Ohio' },
  { from: 460, to: 479, state: 'Indiana' },
  { from: 480, to: 499, state: 'Michigan' },
  { from: 500, to: 528, state: 'Iowa' },
  { from: 530, to: 549, state: 'Wisconsin' },
  { from: 550, to: 567, state: 'Minnesota' },
  { from: 570, to: 577, state: 'South Dakota' },
  { from: 580, to: 588, state: 'North Dakota' },
  { from: 590, to: 599, state: 'Montana' },
  { from: 600, to: 629, state: 'Illinois' },
  { from: 630, to: 658, state: 'Missouri' },
  { from: 660, to: 679, state: 'Kansas' },
  { from: 680, to: 693, state: 'Nebraska' },
  { from: 700, to: 714, state: 'Louisiana' },
  { from: 716, to: 729, state: 'Arkansas' },
  { from: 730, to: 749, state: 'Oklahoma' },
  { from: 750, to: 799, state: 'Texas' },
  { from: 800, to: 816, state: 'Colorado' },
  { from: 820, to: 831, state: 'Wyoming' },
  { from: 832, to: 838, state: 'Idaho' },
  { from: 840, to: 847, state: 'Utah' },
  { from: 850, to: 865, state: 'Arizona' },
  { from: 870, to: 884, state: 'New Mexico' },
  { from: 889, to: 898, state: 'Nevada' },
  { from: 900, to: 961, state: 'California' },
  { from: 967, to: 968, state: 'Hawaii' },
  { from: 970, to: 979, state: 'Oregon' },
  { from: 980, to: 994, state: 'Washington' },
  { from: 995, to: 999, state: 'Alaska' },
]

/** Exactly five digits. Anything else is a typo, not a ZIP in another format. */
export const isZip = (v: string): boolean => /^\d{5}$/.test(v.trim())

/**
 * The state a ZIP sits in, or undefined for an unallocated prefix.
 *
 * Undefined is a real answer, not a failure: plenty of 3-digit prefixes are unassigned, and saying
 * "we do not know" is better than snapping to the nearest range and putting a persona in the wrong
 * state.
 */
export function stateForZip(v: string): string | undefined {
  if (!isZip(v)) return undefined
  const prefix = Number(v.trim().slice(0, 3))
  return RANGES.find((r) => prefix >= r.from && prefix <= r.to)?.state
}

/**
 * How a resolved location is stored and shown: "07740 · New Jersey".
 *
 * One string rather than two fields, because every reader of this — the card, the record table, the
 * copy prompt — wants the pair together, and splitting it would mean four places agreeing on how to
 * rejoin it.
 */
export const formatZip = (v: string): string => {
  const zip = v.trim()
  const state = stateForZip(zip)
  return state ? `${zip} · ${state}` : zip
}

/** The ZIP back out of a stored "07740 · New Jersey", for editing. */
export const zipOf = (stored: string): string => (stored ?? '').trim().split('·')[0].trim()
