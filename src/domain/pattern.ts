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
