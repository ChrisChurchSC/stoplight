import type { ObjectReference } from './objectReference'
import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Pattern record — Records › Foundation › Patterns. A reusable messaging pattern, hook, format, or
 * a trend worth riding — the recurring shapes your content leans on. Upload them (add / paste) so
 * they're a library the generator and the team can reach for. Hand-editable; nothing seeded.
 */
export interface Pattern {
  id: string
  /** Which brand's workspace this record belongs to (scoped by the rail). Untagged = shows for all. */
  brand?: string
  name: string
  /** Pattern / Trend / Hook / Format / Structure. */
  type?: string
  description?: string
  example?: string
  whenToUse?: string
  /** Channel it fits best (picked from the channel list). */
  channel?: string
  /** Where it came from — a link to the trend, post, or reference. */
  source?: string
  status?: 'active' | 'testing' | 'archived' | ''
  notes?: string
  /** The document this record is, kept whole. Not a column: see Voice.reference for why. */
  reference?: ObjectReference
}

/** What kind of pattern this is — a fixed pick-list. */
export const PATTERN_TYPE_OPTIONS = ['Pattern', 'Trend', 'Hook', 'Format', 'Structure'] as const

export const PATTERN_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Pattern', kind: 'name', width: 240, group: 'Pattern' },
  { key: 'type', label: 'Type', kind: 'text', width: 130, group: 'Pattern', options: PATTERN_TYPE_OPTIONS },
  { key: 'description', label: 'Description', kind: 'text', width: 300, group: 'Pattern' },
  { key: 'channel', label: 'Channel', kind: 'ref', width: 150, group: 'Fit' },
  { key: 'source', label: 'Source', kind: 'url', width: 160, group: 'Fit' },
  { key: 'status', label: 'Status', kind: 'status', width: 120, group: 'State' },
]

export const PATTERN_FIELDS: RecordField[] = [
  { key: 'name', label: 'Pattern', kind: 'name', group: 'Pattern' },
  { key: 'type', label: 'Type', kind: 'text', group: 'Pattern', options: PATTERN_TYPE_OPTIONS },
  { key: 'description', label: 'Description', kind: 'multiline', group: 'Pattern' },
  { key: 'example', label: 'Example', kind: 'multiline', group: 'Pattern' },
  { key: 'whenToUse', label: 'When to use', kind: 'multiline', group: 'Fit' },
  { key: 'channel', label: 'Channel', kind: 'ref', group: 'Fit' },
  { key: 'source', label: 'Source', kind: 'url', group: 'Fit' },
  { key: 'status', label: 'Status', kind: 'status', group: 'State' },
  { key: 'notes', label: 'Notes', kind: 'multiline', group: 'State' },
]

export const PATTERN_STATUSES: NonNullable<Pattern['status']>[] = ['active', 'testing', 'archived']

export function freshPatternId(): string {
  return freshRecordId('pat')
}

/**
 * A RETIRED PATTERN NEVER TRAVELS.
 *
 * Archiving is how this library says "we stopped using this", and unlike deleting it, the refs that
 * name it survive. Without this rule a pattern retired months ago keeps shaping copy from a wire
 * nobody thought to revisit, and it does it silently: the card still draws, still reads as attached,
 * still names a real record.
 *
 * A pattern in TESTING does travel. Testing one is what using it means.
 *
 * One predicate, shared by every surface that offers or applies a pattern (the canvas picker, the
 * grid's column, and the copy pools), because three copies of a rule this quiet is three chances for
 * the picker to offer what generation drops.
 */
export const isPatternRetired = (p: Pick<Pattern, 'status'>): boolean => p.status === 'archived'

/** The patterns still in play, in the order given. */
export const usablePatterns = <T extends Pick<Pattern, 'status'>>(list: T[]): T[] => list.filter((p) => !isPatternRetired(p))

/** A pattern as the copy writer receives it: the shape, and nothing about what to say. */
export interface AssetPattern {
  name: string
  type?: string
  description?: string
  example?: string
  whenToUse?: string
}

/**
 * THE PATTERN ONE ASSET IS WRITTEN TO, given the pool reaching it and its index in the batch.
 *
 * Rotates on the index, the same way proof does, and that rotation is the point rather than a
 * detail: a pattern pinned to a single asset arrives as a pool of one and lands on it every time,
 * while three patterns wired to the campaign brief make the set span three shapes instead of writing
 * the same post twenty times. Choosing patterns is choosing how much the set varies.
 *
 * An unnamed pattern is dropped rather than sent as a blank instruction, and every other field is
 * sent only where somebody wrote something — an empty string reads to the writer as an answer.
 */
export function patternForAsset(pool: Pattern[], index: number): AssetPattern | undefined {
  const live = usablePatterns(pool)
  if (!live.length) return undefined
  const p = live[((index % live.length) + live.length) % live.length]
  const name = p.name?.trim()
  if (!name) return undefined
  return {
    name,
    type: p.type?.trim() || undefined,
    description: p.description?.trim() || undefined,
    example: p.example?.trim() || undefined,
    whenToUse: p.whenToUse?.trim() || undefined,
  }
}
