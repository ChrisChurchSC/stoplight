/**
 * Shared shapes for the Records tables (Companies, People, …). A record is any object
 * with a string `id` and string-ish fields; a column maps a field key to a label and a
 * render kind. Kept generic so one <RecordsTable> renders every record type.
 */
export type RecordFieldKind = 'name' | 'text' | 'url' | 'status' | 'multiline'

/** A field in a record's detail panel: a key, a label, and how to render it. */
export interface RecordField {
  key: string
  label: string
  kind: RecordFieldKind
}

/** A field that also appears as a table column (adds a pixel width). */
export interface RecordColumn extends RecordField {
  width: number
}

const TINTS = ['#6fb3ff', '#ff8a5c', '#9b7bff', '#33b579', '#eab308', '#e5628a', '#4bb3c4']

/** A stable color for an avatar / status pill, hashed off the value so it never shifts. */
export const recordTint = (s: string): string =>
  TINTS[[...(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length]

export function freshRecordId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}
