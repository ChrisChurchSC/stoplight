import { DIRECTION_FIELD, DIRECTION_KEYS, RETIRED_DIRECTION, capFor, type DirectionKey } from './direction'
import { CREATABLE_OBJECT_KINDS, REF_TYPE_FOR_OBJECT_KIND, type CanvasObject, type CanvasObjectKind } from './flowBoard'
import { pickReference, type ObjectReference } from './objectReference'

/**
 * WHAT AN OBJECT CARD ASKS FOR, AND WHETHER AN AGENT ANSWERED ALL OF IT.
 *
 * The asset-card twin of assetFields.ts, for the other kind of card in this app. An object card's
 * panel asks three things: what to call it, which record it points at, and its DIRECTION — the
 * instruction it gives the copy writer, from a closed vocabulary that differs per kind (an Audience
 * asks for a pain and an objection, a Trigger for what the reader just did and what to ask them).
 *
 * The same failure was available here as on an asset card, for the same reason: an agent that
 * cannot see the vocabulary cannot fill it, and a card that answers none of its questions still
 * looks like a card. Direction is the whole reason a card is on the board — an Audience card with
 * no pain and no objection contributes a name and nothing else to the copy — so a half-answered one
 * is worth reporting rather than quietly accepting.
 *
 * Deliberately NOT a second vocabulary: the keys, labels, hints and caps are direction.ts's own,
 * read rather than restated, so a key withdrawn from a kind stops being offered here too.
 */

/** One question a card of this kind asks, as an agent sees it. */
export interface ObjectFieldSpec {
  key: DirectionKey
  /** What the panel calls it. */
  label: string
  /** The question under the label — what a good answer contains. */
  hint: string
  /** Hard cap; values longer are trimmed on the way in. */
  hardLimit: number
}

/** The kinds an agent may put on a board — the toolbar's own set, so nothing uncreatable is offered. */
export const OBJECT_CARD_KINDS: CanvasObjectKind[] = [...CREATABLE_OBJECT_KINDS].sort()

/**
 * The direction a card of this kind asks for, in panel order.
 *
 * Retired keys are excluded: a Voice card keeps answers it was given before the field was withdrawn,
 * but `directionOf` drops them on the way to the writer, so offering them to an agent would be
 * offering a field whose answer reaches nothing.
 */
export function describeObjectFields(kind: CanvasObjectKind): ObjectFieldSpec[] {
  const retired = new Set(RETIRED_DIRECTION[kind] ?? [])
  return (DIRECTION_KEYS[kind] ?? [])
    .filter((k) => !retired.has(k))
    .map((key) => ({ key, label: DIRECTION_FIELD[key].label, hint: DIRECTION_FIELD[key].hint, hardLimit: capFor(key) }))
}

/** The record type a card of this kind names, or null for the kinds that carry none. */
export const recordTypeFor = (kind: CanvasObjectKind): string | null => REF_TYPE_FOR_OBJECT_KIND[kind] ?? null

/** Thrown when a write names a direction key this kind does not ask for. */
export class UnknownObjectFieldError extends Error {
  constructor(readonly unknownKeys: string[], readonly kind: CanvasObjectKind, readonly validKeys: string[]) {
    super(
      validKeys.length
        ? `unknown direction key(s) for a ${kind} card: ${unknownKeys.join(', ')}. It asks for: ${validKeys.join(', ')}.`
        : `a ${kind} card asks for no direction, so it takes no fields (it contributes through its record and name).`,
    )
    this.name = 'UnknownObjectFieldError'
  }
}

export interface AppliedDirection {
  /** The direction to store on the card: existing entries with this write laid over them. */
  direction: { key: string; value: string }[]
  /** Keys whose value was over the cap and was trimmed. */
  clamped: DirectionKey[]
}

/**
 * Lay a write over a card's existing direction. Keys not mentioned keep their answers.
 *
 * A key the kind does not ask for is an error rather than a silent store, for the reason an unknown
 * messaging key is: it would sit on the card answering a question nobody asked, invisible in the
 * panel and reaching nothing, while the write reported success.
 */
export function applyDirection(
  kind: CanvasObjectKind,
  base: { key: string; value: string }[] | undefined,
  fields: Record<string, unknown> | undefined,
): AppliedDirection {
  const asks = describeObjectFields(kind)
  const byKey = new Map(asks.map((f) => [f.key as string, f]))
  const next = new Map((base ?? []).map((e) => [e.key, e.value]))
  const clamped: DirectionKey[] = []
  const entries = Object.entries(fields ?? {}).filter(([, v]) => typeof v === 'string')
  const unknown = entries.map(([k]) => k).filter((k) => !byKey.has(k))
  if (unknown.length) throw new UnknownObjectFieldError(unknown, kind, asks.map((f) => f.key))
  for (const [key, raw] of entries) {
    const spec = byKey.get(key)!
    const value = (raw as string).trim()
    const capped = value.length > spec.hardLimit ? value.slice(0, spec.hardLimit).trimEnd() : value
    if (capped !== value) clamped.push(spec.key)
    // An empty answer CLEARS the field rather than storing a blank one, so a card can be corrected
    // back to unanswered.
    if (capped) next.set(key, capped)
    else next.delete(key)
  }
  return { direction: [...next].map(([key, value]) => ({ key, value })), clamped }
}

/**
 * Which of a card's questions are answered and which are blank.
 *
 * A kind that asks nothing (a Note, a Voice, a Concept) is complete by definition — being the kinds
 * that contribute through their record instead is deliberate, and reporting them permanently
 * unfinished would train an agent to try to fill something that does not exist.
 */
export function directionCoverage(
  kind: CanvasObjectKind,
  direction: { key: string; value: string }[] | undefined,
): { filled: DirectionKey[]; missing: DirectionKey[]; complete: boolean; asksNothing: boolean } {
  const answered = new Map((direction ?? []).map((e) => [e.key, (e.value ?? '').trim()]))
  const asks = describeObjectFields(kind)
  const filled: DirectionKey[] = []
  const missing: DirectionKey[] = []
  for (const f of asks) {
    if (answered.get(f.key)) filled.push(f.key)
    else missing.push(f.key)
  }
  return { filled, missing, complete: missing.length === 0, asksNothing: asks.length === 0 }
}

/**
 * IS THIS CARD IDENTIFIABLE, AND DOES IT SAY WHAT IT IS?
 *
 * Direction is what a card contributes to the COPY. These two are what it contributes to everyone
 * LOOKING at it, and a generated board fails on them first: three Audience cards that all read
 * "Audience" in the Layers panel and in every "what feeds this asset" answer, none of them saying
 * who the audience is.
 *
 *  - A NAME is the card's own, and survives changing the record under it. Without one a card is
 *    named by whatever it happens to point at, which for a freshly generated card is nothing.
 *  - A DESCRIPTION is the document standing as "here is what this thing is, in the words of the
 *    person who knows". It reaches the writer; the team note deliberately does not.
 *
 * Reported separately from direction rather than folded in, because they fail for different reasons
 * and are fixed by different calls — and because a kind that asks for no direction still owes both.
 */
export function identityCoverage(o: Pick<CanvasObject, 'name' | 'reference' | 'refId'>, recordHasDoc = false): {
  named: boolean
  described: boolean
  missing: ('name' | 'description')[]
} {
  const named = !!(o.name ?? '').trim()
  // The card's own document, or the record's — pickReference's precedence, so this agrees with what
  // the inspector shows and what the writer is actually sent.
  const described = !!(o.reference?.text ?? '').trim() || recordHasDoc
  const missing: ('name' | 'description')[] = []
  if (!named) missing.push('name')
  if (!described) missing.push('description')
  return { named, described, missing }
}

/** A card as an agent reads it back: what it is, what it points at, and what it still owes. */
export function objectCardView(o: CanvasObject, recordDocs?: Map<string, ObjectReference>) {
  const recordDoc = o.refId ? recordDocs?.get(o.refId) : undefined
  const shown = pickReference(o.reference, recordDoc)
  return {
    id: o.id,
    kind: o.kind,
    name: o.name ?? '',
    note: o.text ?? '',
    refId: o.refId ?? '',
    smartObjectId: o.smartObjectId ?? '',
    /** The document this card is read from, and which slot it came from. */
    description: shown?.ref.text ?? '',
    descriptionFrom: shown?.from ?? null,
    direction: Object.fromEntries((o.direction ?? []).map((e) => [e.key, e.value])),
    fields: directionCoverage(o.kind, o.direction),
    identity: identityCoverage(o, !!(recordDoc?.text ?? '').trim()),
  }
}
