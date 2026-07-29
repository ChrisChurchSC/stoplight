import { REF_TYPE_FOR_OBJECT_KIND, freshObjectId, type CanvasObject, type CanvasObjectKind } from './flowBoard'
import type { FlowReference, FlowRefType } from './clients'

/**
 * A SMART OBJECT: a named, reusable bundle that lives in a campaign or in a brand's library.
 *
 * "The RevOps buyer" as one thing holding the contact, the proof that persuades them and the
 * message that lands. You pick the object on a card, not the raw record, because the object is the
 * unit worth naming and reusing across campaigns.
 *
 * WHAT IS INSIDE IS `contents`: canvas OBJECTS, the same shape you place on a board. `refs` is the
 * records those contents resolve to, and it stays a stored field because refsBehind,
 * attachToCampaign and poolsFrom all read it; it is recomputed whenever contents change rather
 * than being authored directly.
 *
 * WHY THIS SHAPE, HAVING ONCE REJECTED IT. Objects began as a bundle of cards and that was
 * abandoned for two reasons, both since fixed. It could not be reused, because the bundle was React
 * state that did not outlive a reload: the board is durable now. And it was circular, because a
 * card inside an object could itself link an object: contents carry a depth cap when resolving and
 * the picker refuses any object that would close a loop, so the cycle is bounded rather than
 * avoided.
 *
 * What holding cards buys is the thing references could not: an object can hold a MESSAGE, a voice,
 * a note, a trigger — everything a board can hold, not just the six things that happen to be
 * records. An object of nothing but a message and a voice is a legitimate object; it simply has no
 * `kind`, so no record picker offers it.
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
   *
   * UNDEFINED when nothing inside resolves to a record, and that is the point: an object holding
   * only a message and a note belongs in no record picker. This was `kind: FlowRefType` with a
   * 'segment' fallback, so every such object was filed as an audience and offered by every Audience
   * picker in the app.
   */
  kind?: FlowRefType
  /** The records the contents resolve to. Recomputed from contents; never authored directly. */
  refs: FlowReference[]
  /**
   * The cards inside. Optional only for objects written before contents existed, which the loader
   * migrates on read (see withContents) — treat it as required everywhere else.
   */
  contents?: CanvasObject[]
  /** Where the contents sit on the object's own canvas, by object id. */
  layout?: Record<string, { x: number; y: number }>
  /**
   * A folder PATH inside its brand's library ("Buyers/RevOps"), or undefined for unfiled. Same
   * path-as-structure trick campaign folders use, and the same helpers read it.
   *
   * No registry of folders: a folder exists because an object is filed in it. That means there is no
   * such thing as an empty one, which is right for a shelf — an empty folder in a library is a
   * promise nobody kept — and it means filing the last object out of a folder removes the folder.
   */
  folder?: string
}

/** How deep nested objects resolve before the walk stops. Bounds the cycle the picker also blocks. */
export const MAX_OBJECT_DEPTH = 3

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
 * The object's kind, given its refs: the lead ref's type, preferring the first one present in a
 * deliberate order. A bundle built around a person reads as a person object even after you add
 * proof to it, so the card you originally reached for keeps offering it.
 *
 * Returns UNDEFINED for an object holding no records. It used to fall back to 'segment', which put
 * every message-only, voice-only or note-only object into every Audience picker in the app.
 */
const KIND_PRIORITY: FlowRefType[] = ['person', 'company', 'segment', 'proof', 'channel', 'media-mix']

export function kindForRefs(refs: FlowReference[]): FlowRefType | undefined {
  for (const k of KIND_PRIORITY) if (refs.some((r) => r.type === k)) return k
  return refs[0]?.type
}

/** The record types, by the object kind that carries them. Reverse of REF_TYPE_FOR_OBJECT_KIND. */
const KIND_FOR_REF_TYPE: Partial<Record<FlowRefType, CanvasObjectKind>> = {
  segment: 'audience',
  proof: 'proof-point',
  company: 'company',
  person: 'person',
}

/**
 * The records a set of contents resolves to, following nested objects to MAX_OBJECT_DEPTH.
 *
 * `label` looks a record up; a card whose record has since been deleted resolves to nothing rather
 * than to a ref with a blank label, which is what would otherwise reach the copy writer.
 */
export function refsFromContents(
  contents: CanvasObject[],
  byId: Map<string, SmartObject>,
  label: (type: FlowRefType, id: string) => string | undefined,
  depth = 0,
): FlowReference[] {
  if (depth >= MAX_OBJECT_DEPTH) return []
  const out: FlowReference[] = []
  const seen = new Set<string>()
  const push = (r: FlowReference) => {
    const k = `${r.type}:${r.id}`
    if (seen.has(k)) return
    seen.add(k)
    out.push(r)
  }
  for (const c of contents) {
    if (c.smartObjectId) {
      const nested = byId.get(c.smartObjectId)
      if (nested) for (const r of resolveObjectRefs(nested, byId, label, depth + 1)) push(r)
      continue
    }
    const type = REF_TYPE_FOR_OBJECT_KIND[c.kind]
    if (!type || !c.refId) continue
    const l = label(type, c.refId)
    if (l) push({ type, id: c.refId, label: l })
  }
  return out
}

/** One object's records, contents-first, falling back to its stored refs pre-migration. */
export function resolveObjectRefs(
  o: SmartObject,
  byId: Map<string, SmartObject>,
  label: (type: FlowRefType, id: string) => string | undefined,
  depth = 0,
): FlowReference[] {
  if (!o.contents) return o.refs
  return refsFromContents(o.contents, byId, label, depth)
}

/**
 * Would putting `candidate` inside `host` close a loop? The picker asks before offering an object,
 * so an object can never be placed inside itself, directly or through a chain.
 */
export function wouldCycle(candidateId: string, hostId: string, byId: Map<string, SmartObject>): boolean {
  if (candidateId === hostId) return true
  const seen = new Set<string>()
  const walk = (id: string): boolean => {
    if (seen.has(id)) return false
    seen.add(id)
    const o = byId.get(id)
    if (!o?.contents) return false
    return o.contents.some((c) => c.smartObjectId === hostId || (c.smartObjectId ? walk(c.smartObjectId) : false))
  }
  return walk(candidateId)
}

/**
 * Give an object contents if it predates them, by synthesizing one card per ref. Read-tolerant and
 * one-way: a ref whose type maps to no card kind is KEPT in refs and simply gets no card, so the
 * object still contributes what it always did while showing what it can.
 */
export function withContents(o: SmartObject): SmartObject {
  if (o.contents) return o
  const contents: CanvasObject[] = []
  const layout: Record<string, { x: number; y: number }> = {}
  o.refs.forEach((r, i) => {
    const kind = KIND_FOR_REF_TYPE[r.type]
    if (!kind) return
    const id = freshObjectId()
    contents.push({ id, kind, text: '', refId: r.id })
    layout[id] = { x: 40, y: 40 + i * 120 }
  })
  return { ...o, contents, layout }
}

/** A one-line summary of what is inside, for the card and the picker: "Jane Doe · 2 proof". */
export function describeSmartObject(o: SmartObject): string {
  // Contents-first, so an object of a message and a note reads as what it holds rather than as
  // "Empty" — which is what a refs-only summary called it, however full it plainly was.
  if (!o.refs.length) {
    const n = o.contents?.length ?? 0
    return n ? `${n} card${n === 1 ? '' : 's'}` : 'Empty'
  }
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
    message: 'message',
    concept: 'concept',
    voice: 'voice',
  }
  const tail = [...byType].map(([t, n]) => `${n} ${LABEL[t]}${n === 1 ? '' : 's'}`)
  return [lead?.label, ...tail].filter(Boolean).join(' · ')
}
