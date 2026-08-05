import type { ObjectReference } from './objectReference'

/**
 * EVERY RECORD'S DOCUMENT, IN ONE MAP, keyed by record id.
 *
 * A card names a record by `refId` and nothing else: it does not carry the record's kind at the
 * point the copy request is assembled, and asking it to would mean a twelve-way switch that has to
 * be extended every time an object kind is added (see the twelve-site checklist this app already
 * pays for once). Record ids are minted with a kind prefix and are unique across every list, so one
 * flat map answers "does the thing this card names have a document" without knowing or caring what
 * kind of thing it is.
 *
 * BUILT FRESH per copy request rather than kept as state. It is read once at the top of a batched
 * draft and the lists it derives from are already the source of truth; a cached index would be a
 * second copy of them to invalidate, and a stale entry here is a brief that reaches the writer after
 * somebody deleted it.
 *
 * EMPTY DOCUMENTS ARE NOT INDEXED. A record whose reference was removed holds `undefined`, but one
 * whose document was whitespace holds a reference that says nothing, and a caller checking
 * `map.has(id)` would treat the two differently for no reason a reader could see.
 */
export function indexRecordDocs(lists: { id: string; reference?: ObjectReference }[][]): Map<string, ObjectReference> {
  const out = new Map<string, ObjectReference>()
  for (const list of lists) {
    for (const r of list ?? []) if (r?.reference?.text.trim()) out.set(r.id, r.reference)
  }
  return out
}
