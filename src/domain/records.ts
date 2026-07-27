/**
 * Shared shapes for the Records tables (Companies, People, …). A record is any object
 * with a string `id` and string-ish fields; a column maps a field key to a label and a
 * render kind. Kept generic so one <RecordsTable> renders every record type.
 */
// 'ref' is a select whose options come from another record type at render time (e.g. a company's
// audience segment, picked from the brand's Segments) — the caller supplies the options per field.
export type RecordFieldKind = 'name' | 'text' | 'url' | 'status' | 'multiline' | 'colors' | 'ref'

/** A field in a record's detail panel: a key, a label, and how to render it. */
export interface RecordField {
  key: string
  label: string
  kind: RecordFieldKind
  /** Optional section heading; consecutive fields sharing a group render under one header. */
  group?: string
  /** A fixed pick-list — renders the cell as a dropdown (e.g. Funnel stage, Cadence). Distinct from
   *  `ref` (options supplied per-field at render time from other records). */
  options?: readonly string[]
  /** Set false to make this column not sortable — for long free-text where an alphabetical sort is
   *  meaningless (message angle, pains, objections). Sortable by default. */
  sortable?: boolean
  /** Progressive disclosure: 'advanced' fields hide in Simple detail level (still reachable via the
   *  drawer's "Advanced fields" expander / a "Show all" escape). Absent = 'core' = always visible. */
  tier?: 'core' | 'advanced'
}

/**
 * Is this pick-list written as sentences rather than one-word enum values?
 *
 * The selects title-case their value so a stored `lead` reads as `Lead`. That is right for the
 * short lowercase enums and wrong for anything phrased as a sentence, where it produces
 * "Not Wasting Their Time". One predicate, shared by the table and the drawer, so a field cannot
 * render capitalized in one and not the other.
 */
export const optionsAreSentences = (options: readonly string[] | undefined): boolean =>
  !!options?.some((o) => o.includes(' ') || /^[A-Z]/.test(o))

/** A field that also appears as a table column (adds a pixel width). */
export interface RecordColumn extends RecordField {
  width: number
}

/** Filter record fields/columns by the user's detail level. In Simple, drop 'advanced'-tier ones;
 *  Advanced (or unset) returns everything. The `name` column is always kept. Pure. */
export function visibleForSkill<T extends RecordField>(specs: T[], skillLevel: 'simple' | 'advanced' | null): T[] {
  if (skillLevel !== 'simple') return specs
  return specs.filter((s) => s.tier !== 'advanced' || s.kind === 'name')
}

const TINTS = ['#6fb3ff', '#ff8a5c', '#9b7bff', '#33b579', '#eab308', '#e5628a', '#4bb3c4']

/** A stable color for an avatar / status pill, hashed off the value so it never shifts. */
export const recordTint = (s: string): string =>
  TINTS[[...(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length]

export function freshRecordId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}
