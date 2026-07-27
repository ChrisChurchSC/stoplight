import type { DirectionKey } from './direction'
import { GOAL_LIBRARY, OBJECTION_LIBRARY, PAIN_LIBRARY } from './taxonomy'

/**
 * SUGGESTED VALUES for an instruction field, drawn from what the brand already has.
 *
 * A blank "Lean on this pain" is a worse prompt than it looks: the pains are already written down on
 * the audience record, and retyping one from memory is how a card ends up saying something slightly
 * different from the record it names. So the presets are the brand's OWN material, offered for a
 * click, and typing something else is always available.
 *
 * NOTHING IS GENERATED HERE, and the distinction matters. A suggestion is either a string the user
 * has already written on one of their own records, or an entry in a hand-written starter library
 * that ships with the app (PAIN_LIBRARY, OBJECTION_LIBRARY, GOAL_LIBRARY) and is labelled as such.
 * Neither is a guess about this brand. What is forbidden is a model-written or inferred suggestion,
 * because a guess in these fields reaches the copy writer as though the user had asserted it.
 *
 * The user's own material always sorts FIRST. A brand that has written its own pains should never
 * have to scroll past a generic list to find them, and once it has written enough the library is
 * effectively gone.
 */

/** What a suggestion is, and where it came from, so the picker can say. */
export interface DirectionPreset {
  value: string
  /** The record it was taken from, shown as a quiet source line ("from the audience"). */
  from: string
}

/** The brand material a preset list can be built from. All optional: an empty source offers nothing. */
export interface DirectionPresetSources {
  /** The audience the card names, when it names one. */
  audience?: { pains?: string[]; objections?: string; antiMessage?: string; goals?: string; messageAngle?: string }
  /** The brand's own claims and voice. */
  differentiators?: string[]
  voice?: string
  hooks?: string[]
  /** The proof pool, for the figure fields. */
  proof?: { label: string; metric?: string }[]
  /** Message records, for a message card's claim. */
  messages?: { angle?: string }[]
  /** The persona a Person card names, for the one instruction a person carries. */
  persona?: { optimizingFor?: string; saysLike?: string; usesNow?: string; hobbies?: string }
  /**
   * What to CALL the audience source in the "from …" line. Defaults to "this audience", which is
   * right when the card names one; a card that names none pools every audience the brand has, and
   * saying "this audience" about a pool would claim a precision the suggestion does not have.
   */
  audienceFrom?: string
}

/** The starter vocabularies, offered under their own heading after the brand's own writing. */
const LIBRARY_FOR: Partial<Record<DirectionKey, readonly string[]>> = {
  pain: PAIN_LIBRARY,
  objection: OBJECTION_LIBRARY,
  caresAbout: GOAL_LIBRARY,
}

const clean = (v: string | undefined): string => (v ?? '').trim()
const split = (v: string | undefined): string[] =>
  clean(v)
    .split(/[\n;]+|(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2)

/**
 * Suggestions for one instruction key. Deduped, capped, and never fabricated.
 *
 * Keys with no honest source (justDid, ask, situation, moment, permission) still return nothing:
 * they describe a moment or an account, which neither the brand's records nor a generic list can
 * hold, and a plausible filler would be worse than an empty list. The card renders those as a plain
 * text box rather than an empty dropdown.
 */
export function directionPresets(key: DirectionKey, src: DirectionPresetSources): DirectionPreset[] {
  const out: DirectionPreset[] = []
  const audFrom = src.audienceFrom ?? 'this audience'
  const push = (value: string, from: string) => {
    const v = value.trim()
    if (v.length > 2 && !out.some((o) => o.value.toLowerCase() === v.toLowerCase())) out.push({ value: v, from })
  }
  switch (key) {
    case 'pain':
      for (const p of src.audience?.pains ?? []) push(p, audFrom)
      break
    case 'objection':
      for (const o of split(src.audience?.objections)) push(o, audFrom)
      break
    case 'claim':
      for (const d of src.differentiators ?? []) push(d, 'the brand')
      for (const m of src.messages ?? []) if (m.angle) push(m.angle, 'a message record')
      break
    case 'notThis':
      for (const a of split(src.audience?.antiMessage)) push(a, `${audFrom}'s anti-message`)
      break
    case 'figure':
      for (const p of src.proof ?? []) push(p.metric?.trim() ? `${p.metric} (${p.label})` : p.label, 'the proof pool')
      break
    case 'likeThis':
      for (const h of src.hooks ?? []) push(h, 'a brand hook')
      if (src.voice) push(clean(src.voice), 'the brand voice')
      break
    case 'avoidSay':
      for (const a of split(src.audience?.antiMessage)) push(a, `${audFrom}'s anti-message`)
      break
    case 'caresAbout':
      // A person's one instruction, suggested from the persona itself: what they are optimizing for
      // is the closest thing on the record to what they care about, and their own words are the
      // point of writing to a person rather than a bracket.
      if (src.persona?.optimizingFor) push(src.persona.optimizingFor, 'what they want')
      if (src.persona?.saysLike) push(src.persona.saysLike, 'how they talk')
      if (src.persona?.usesNow) push(`Getting off ${src.persona.usesNow}`, 'what they use today')
      break
    default:
      // justDid, ask, situation, moment, permission: nothing in the library answers these, and
      // inventing one would put words the user never wrote in front of the copy writer.
      break
  }
  // The starter list goes last, so a brand's own wording is always what you see first. push() dedupes
  // case-insensitively, so a library entry the brand has already written does not appear twice.
  for (const v of LIBRARY_FOR[key] ?? []) push(v, 'the common list')
  return out.slice(0, 14)
}
