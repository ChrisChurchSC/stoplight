import type { FlowReference, FlowRefType } from './clients'

/**
 * A SMART OBJECT: a named, reusable bundle of records that lives in a brand's library.
 *
 * "The RevOps buyer" as one thing holding the contact, the proof that persuades them and the
 * message that lands. You pick the object on a card, not the raw record, because the object is the
 * unit worth naming and reusing across campaigns; the records are its contents.
 *
 * NOTE ON THE EARLIER SHAPE: objects began life on the canvas as a bundle of CARDS, scoped to one
 * campaign and held in React state. That could not be reused (it did not outlive a reload) and it
 * was circular once cards started linking objects: a person card inside an object would itself
 * link an object. Holding REFERENCES instead breaks the cycle and makes the object the durable
 * thing, with cards as views onto it.
 */
/**
 * WHERE a smart object lives. The ladder has two rungs and you climb it deliberately.
 *
 * 'campaign' is where every object starts: made on one board, usable only there. That is the honest
 * default, because most bundles are made in the middle of thinking and are not yet worth anyone
 * else's attention. 'brand' is the promotion: it moves into the brand folder and every campaign can
 * reach it, and from then on an edit reaches all of them.
 *
 * Cmd+G used to write straight to the brand library, so every bundle anyone made anywhere became
 * part of the brand's shared vocabulary the moment it existed. The library filled with one-offs and
 * stopped being worth reading.
 */
export type SmartObjectScope = 'campaign' | 'brand'

export interface SmartObject {
  id: string
  /**
   * The brand whose library owns it. Set once it is promoted; a campaign-scoped object may carry it
   * too (it is where it will land), so `scope` is what decides visibility, never the presence of
   * this field.
   */
  brand?: string
  /** Which rung it sits on. Absent on objects written before the ladder existed: those were all
   *  brand-library objects, so a missing scope reads as 'brand' (see scopeOf). */
  scope?: SmartObjectScope
  /** The campaign it was made on. Required in practice for a campaign-scoped object: without it,
   *  nothing can tell which board may see it. */
  campaign?: string
  name: string
  /**
   * What KIND of thing this object is, which is what a card's picker filters on: a Person card
   * offers person objects. Taken from the record type the object leads with, so an object built
   * around a contact is a person object even when it also carries proof and a message.
   */
  kind: FlowRefType
  /** Everything inside, across record types. The object's kind is just its lead type. */
  refs: FlowReference[]
}

export function freshSmartObjectId(): string {
  return `obj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * An object's scope, defaulting a missing one to 'brand'. Every object written before the scope
 * field existed WAS in the brand library, so reading the absence as 'campaign' would make a
 * library's worth of objects vanish from the pickers that offer them.
 */
export const scopeOf = (o: SmartObject): SmartObjectScope => o.scope ?? 'brand'

/** Is this object reachable from a board? Brand objects always; a local one only on its own board. */
export const visibleOnCampaign = (o: SmartObject, brand: string, campaign: string | null): boolean => {
  if (o.brand && o.brand !== brand) return false
  return scopeOf(o) === 'brand' ? true : !!campaign && o.campaign === campaign
}

/**
 * The object's kind, given its contents: the lead ref's type, preferring the first one present in
 * a deliberate order. A bundle built around a person reads as a person object even after you add
 * proof to it, so the card you originally reached for keeps offering it.
 */
const KIND_PRIORITY: FlowRefType[] = ['person', 'company', 'segment', 'proof', 'channel', 'media-mix']

export function kindForRefs(refs: FlowReference[], fallback: FlowRefType = 'segment'): FlowRefType {
  for (const k of KIND_PRIORITY) if (refs.some((r) => r.type === k)) return k
  return refs[0]?.type ?? fallback
}

/** A one-line summary of what is inside, for the card and the picker: "Jane Doe · 2 proof". */
export function describeSmartObject(o: SmartObject): string {
  if (!o.refs.length) return 'Empty'
  const lead = o.refs.find((r) => r.type === o.kind)
  const rest = o.refs.filter((r) => r !== lead)
  const byType = new Map<FlowRefType, number>()
  for (const r of rest) byType.set(r.type, (byType.get(r.type) ?? 0) + 1)
  const LABEL: Record<FlowRefType, string> = {
    segment: 'audience',
    company: 'company',
    person: 'contact',
    proof: 'proof',
    channel: 'channel',
    'media-mix': 'media mix',
  }
  const tail = [...byType].map(([t, n]) => `${n} ${LABEL[t]}${n === 1 ? '' : 's'}`)
  return [lead?.label, ...tail].filter(Boolean).join(' · ')
}
