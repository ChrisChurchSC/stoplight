/**
 * DIRECTION: the instruction an object gives the copy writer about THIS campaign.
 *
 * The rule that decides what belongs here, and it is sharp enough to reject a field. An object asks
 * only for an INSTRUCTION, and a candidate must pass all three tests:
 *   1. It is an instruction, not a definition. Definitions live on the record. "How to phrase this
 *      proof" is rejected because that is Rtb.detail.
 *   2. It is specific to this campaign. If it can be answered once for the brand, it is a record
 *      field. "A sharper sub-segment" is rejected because that is AudienceType.definition.
 *   3. It changes a sentence the model writes. If no slot reads it, it belongs nowhere. Trigger's
 *      channel and type are rejected, and so is every status, owner, website and email.
 *
 * Thirteen keys survive, one or two per object kind. They ride INSIDE the per-asset payload, which
 * matters: the assets array is stringified wholesale by the server, so unlike a top-level request
 * field a per-asset one cannot be silently dropped at the destructure. That is exactly how the
 * brand's hook list went unused for months.
 */

export type DirectionKey =
  | 'pain' | 'objection'        // audience
  | 'claim' | 'notThis'         // message
  | 'figure'                    // proof point, data source
  // Asked by no kind since Voice and Concept both retired them. Kept, and kept valid: the chat's
  // setDirection can still set either on a card deliberately, and RETIRED_DIRECTION drops them only
  // for the two kinds that withdrew them.
  | 'likeThis' | 'avoidSay'
  | 'justDid' | 'ask'           // trigger
  | 'situation'                 // company
  | 'caresAbout'                // person
  | 'moment' | 'permission'     // season

/** The sentence the MODEL reads for each key. These are prompt copy, not UI labels. */
export const DIRECTION_LABEL: Record<DirectionKey, string> = {
  pain: 'Lean on this pain',
  objection: 'Answer this objection',
  claim: 'Assert this',
  notThis: 'Do not claim this',
  figure: 'Cite this figure',
  likeThis: 'Match the register of this line',
  avoidSay: 'Never use these words',
  justDid: 'The reader has already done this, so do not re-explain it',
  ask: 'Ask for exactly this',
  situation: 'True at this account right now',
  caresAbout: 'This reader cares about',
  moment: 'Timed to this moment',
  permission: 'This moment lets you say',
}

/** What the INSPECTOR asks, per key: a short label and the question under it. */
export const DIRECTION_FIELD: Record<DirectionKey, { label: string; hint: string }> = {
  pain: { label: 'Lean on this pain', hint: 'The one pain this campaign argues from' },
  objection: { label: 'Beat this objection', hint: 'What they will think that the copy has to answer' },
  claim: { label: 'The claim', hint: 'What this asset asserts' },
  notThis: { label: 'But not this', hint: 'The near-miss claim to avoid' },
  figure: { label: 'The figure', hint: 'A number worth citing, and where it comes from' },
  likeThis: { label: 'Sounds like this', hint: 'One real line in the right register' },
  avoidSay: { label: 'Never say', hint: 'Words and phrases to keep out' },
  justDid: { label: 'They just did', hint: 'What the reader has already done' },
  ask: { label: 'The ask', hint: 'The one action, and where it goes' },
  situation: { label: 'Right now', hint: 'What is true at this account today' },
  caresAbout: { label: 'They care about', hint: 'In their words, not the segment’s' },
  moment: { label: 'The moment', hint: 'Which moment this is timed to' },
  permission: { label: 'Which lets you say', hint: 'What this moment permits that you cannot say otherwise' },
}

/**
 * Which keys each object kind asks for. Kinds absent from this map ask nothing:
 * - note is deliberately silent. Being the one kind that contributes nothing is what makes the
 *   other ten kinds' claim credible.
 * - data-source asks for a figure, not its connector: a connector name changes no copy, a number does.
 */
export const DIRECTION_KEYS: Partial<Record<string, DirectionKey[]>> = {
  audience: ['pain', 'objection'],
  message: ['claim', 'notThis'],
  'proof-point': ['figure'],
  // Voice asks nothing. A Voice card names a voice record, and that record already carries the
  // register and the words to avoid for every campaign that uses it; asking the card for a sample
  // line and a banned-words list put the same two questions on the board in a second vocabulary,
  // per campaign, where nothing could compare them. See RETIRED_DIRECTION below.
  trigger: ['justDid', 'ask'],
  company: ['situation'],
  person: ['caresAbout'],
  // Concept asks nothing, for the reason Voice above asks nothing. A Concept card names a Concept
  // record, and that record IS the answer to both questions it used to put on the card: `idea` is
  // the big idea in one line, `likeThis` is the reference to write toward, and both are sent to the
  // writer for every campaign that uses the record. Asking the card for "The claim" and "Sounds
  // like this" put the same two questions on the board in a second vocabulary, per campaign, where
  // nothing could compare them to the record they duplicate. See RETIRED_DIRECTION below.
  season: ['moment', 'permission'],
  'data-source': ['figure'],
}

/**
 * FIELDS A KIND USED TO ASK FOR, and no longer sends.
 *
 * A card keeps every instruction it was ever given, so withdrawing a field from the inspector is
 * only half the job: without this, its old answers would sit on the card, invisible in the panel
 * and still shaping the copy. directionOf reads this and drops them.
 *
 * The values are NOT deleted from the card. Nothing is lost if a field comes back, and a stored
 * string that reaches nothing is harmless in a way that a hidden instruction is not.
 */
export const RETIRED_DIRECTION: Partial<Record<string, DirectionKey[]>> = {
  voice: ['likeThis', 'avoidSay'],
  concept: ['claim', 'likeThis'],
}

export interface DirectionEntry {
  key: DirectionKey
  /** The sentence the model reads, from DIRECTION_LABEL. Carried so the server needs no lookup. */
  label: string
  value: string
}

/** Per-key character cap. A moment is a date-ish phrase, so it is tighter. */
const CAP: Partial<Record<DirectionKey, number>> = { moment: 120 }
const DEFAULT_CAP = 200
export const capFor = (k: DirectionKey): number => CAP[k] ?? DEFAULT_CAP

/**
 * Priority when an asset has more direction than it can carry. A hard negative and a quantified
 * number always survive a crowded deliverable; a moment falls first, because a date changes no
 * argument on its own.
 */
const PRIORITY: DirectionKey[] = [
  'avoidSay', 'notThis', 'claim', 'figure', 'objection', 'pain',
  'ask', 'justDid', 'situation', 'caresAbout', 'likeThis', 'permission', 'moment',
]
export const MAX_ENTRIES_PER_ASSET = 6

/** Trim to a cap at a word boundary, so the limit reads as an edit rather than a truncation. */
function clamp(v: string, max: number): string {
  const t = v.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > Math.floor(max * 0.6) ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '')
}

/**
 * The only way a DirectionEntry[] should ever be produced. FAILS CLOSED: an unknown key is dropped
 * rather than passed through, so a typo or a stale persisted value can never reach the prompt.
 * Never trust the UI to have enforced any of this.
 */
export function buildDirection(raw: { key: string; value: string }[] | undefined): DirectionEntry[] {
  if (!raw?.length) return []
  const seen = new Set<DirectionKey>()
  const kept: DirectionEntry[] = []
  for (const k of PRIORITY) {
    if (kept.length >= MAX_ENTRIES_PER_ASSET) break
    for (const r of raw) {
      if (r.key !== k || seen.has(k)) continue
      const v = clamp(String(r.value ?? ''), capFor(k))
      if (!v) continue
      seen.add(k)
      kept.push({ key: k, label: DIRECTION_LABEL[k], value: v })
      break
    }
  }
  return kept
}

/** Every key any object kind can contribute, for validating persisted values. */
export const ALL_DIRECTION_KEYS = new Set<DirectionKey>(PRIORITY)
