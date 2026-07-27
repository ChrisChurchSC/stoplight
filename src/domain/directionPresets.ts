import type { DirectionKey } from './direction'

/**
 * SUGGESTED VALUES for an instruction field, drawn from what the brand already has.
 *
 * A blank "Lean on this pain" is a worse prompt than it looks: the pains are already written down on
 * the audience record, and retyping one from memory is how a card ends up saying something slightly
 * different from the record it names. So the presets are the brand's OWN material, offered for a
 * click, and typing something else is always available.
 *
 * NOTHING IS INVENTED HERE. Every suggestion is a string the user has already written somewhere, so
 * an empty library offers an empty list rather than a plausible-sounding guess. A guess in this field
 * would reach the copy writer as though the user had asserted it.
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

const clean = (v: string | undefined): string => (v ?? '').trim()
const split = (v: string | undefined): string[] =>
  clean(v)
    .split(/[\n;]+|(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2)

/**
 * Suggestions for one instruction key. Deduped, capped, and never fabricated.
 *
 * Keys with no honest source (justDid, ask, situation, caresAbout, moment, permission) return
 * nothing: they describe a moment or an account, which the brand library does not hold, and a
 * plausible filler would be worse than an empty list.
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
  return out.slice(0, 8)
}
