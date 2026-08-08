import type { AudienceType } from './audiences'
import type { FlowReference } from './clients'

/**
 * WHICH OF A BRAND'S AUDIENCES ANYTHING ACTUALLY POINTS AT.
 *
 * The shelf accumulates. Every campaign build seeds records for the audiences it writes to, and
 * the chat mints one whenever copy targets a segment that does not exist yet — deliberately, and
 * deduped, but each build still leaves a few behind. For as long as the pickers read the wrong
 * shelf none of this showed; the moment the scope was fixed, an Audience card's dropdown opened
 * onto thirty-six options nobody remembered making. The records are real. Most are just unused.
 *
 * This says which is which, so a cleanup can remove ONLY what nothing references. The net is cast
 * deliberately wide — an asset's pins, its plain-string audience, every board's Audience cards,
 * a smart object's refs and its bundled contents, and every campaign record's pins, archived
 * included, matched by id AND by name — because the cost of keeping an unused record is a noisy
 * picker, and the cost of dropping a used one is a hole in an asset's Made from. When in doubt,
 * it is used.
 *
 * A DOMAIN FUNCTION, not a store action, for the same reason the scope rules are: what "unused"
 * means is a boundary worth a test, and the store's job is only to apply the answer.
 */
export interface AudienceUsage {
  /** Every asset row, archived included: restoring a campaign must not surface holes. */
  rows: readonly { audience?: string; references?: readonly FlowReference[] }[]
  /** Every campaign board, the builder's included. */
  boards: readonly { objects: readonly { kind: string; refId?: string }[] }[]
  smartObjects: readonly {
    refs?: readonly FlowReference[]
    contents?: readonly { kind: string; refId?: string }[]
  }[]
  campaigns: readonly { references?: readonly FlowReference[] }[]
}

const norm = (s: string | undefined): string => (s ?? '').trim().toLowerCase()

export function splitAudiencesByUse(
  shelf: readonly AudienceType[],
  usage: AudienceUsage,
): { used: AudienceType[]; unused: AudienceType[] } {
  const ids = new Set<string>()
  const names = new Set<string>()
  const takeRefs = (refs: readonly FlowReference[] | undefined) => {
    for (const r of refs ?? []) {
      if (r.type !== 'segment') continue
      if (r.id) ids.add(r.id)
      // The label is the record's name as it was pinned; a rename since should not orphan the pin's
      // record, which is why ids are collected too — but a label match alone still counts.
      if (norm(r.label)) names.add(norm(r.label))
    }
  }
  const takeCards = (cards: readonly { kind: string; refId?: string }[] | undefined) => {
    for (const o of cards ?? []) if (o.kind === 'audience' && o.refId) ids.add(o.refId)
  }
  for (const r of usage.rows) {
    if (norm(r.audience)) names.add(norm(r.audience))
    takeRefs(r.references)
  }
  for (const b of usage.boards) takeCards(b.objects)
  for (const o of usage.smartObjects) {
    takeRefs(o.refs)
    takeCards(o.contents)
  }
  for (const c of usage.campaigns) takeRefs(c.references)

  const used: AudienceType[] = []
  const unused: AudienceType[] = []
  for (const a of shelf) {
    const hit = ids.has(a.id) || names.has(norm(a.name)) || (a.aliases ?? []).some((al) => names.has(norm(al)))
    ;(hit ? used : unused).push(a)
  }
  return { used, unused }
}
