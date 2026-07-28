import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Trigger record — Records › Go-to-market › Triggers. The events and conditions that kick off
 * outreach: a signal (what fires it) and the response (what runs). The behavioral/lifecycle/time
 * moments a brand acts on. Hand-editable; nothing seeded.
 */
export interface Trigger {
  id: string
  /** Which brand's workspace this record belongs to (scoped by the rail). Untagged = shows for all. */
  brand?: string
  name: string
  /** Behavioral / Lifecycle / Time-based / Intent / Milestone. */
  type?: string
  /** What fires it — the event or condition. */
  signal?: string
  /** What runs when it fires — the response. */
  response?: string
  /** Channel it acts on (picked from the channel list). */
  channel?: string
  /** Audience it targets (picked from the brand's audiences). */
  audience?: string
  status?: 'active' | 'paused' | 'draft' | ''
  notes?: string
}

/** What kind of trigger this is — a fixed pick-list. */
export const TRIGGER_TYPE_OPTIONS = ['Behavioral', 'Lifecycle', 'Time-based', 'Intent', 'Milestone'] as const

export const TRIGGER_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Trigger', kind: 'name', width: 220, group: 'Trigger' },
  { key: 'type', label: 'Type', kind: 'text', width: 130, group: 'Trigger', options: TRIGGER_TYPE_OPTIONS },
  { key: 'signal', label: 'Signal', kind: 'text', width: 240, group: 'Trigger' },
  { key: 'response', label: 'Response', kind: 'text', width: 240, group: 'Response' },
  { key: 'channel', label: 'Channel', kind: 'ref', width: 150, group: 'Response' },
  { key: 'status', label: 'Status', kind: 'status', width: 120, group: 'State' },
]

export const TRIGGER_FIELDS: RecordField[] = [
  { key: 'name', label: 'Trigger', kind: 'name', group: 'Trigger' },
  { key: 'type', label: 'Type', kind: 'text', group: 'Trigger', options: TRIGGER_TYPE_OPTIONS },
  { key: 'signal', label: 'Signal — what fires it', kind: 'multiline', group: 'Trigger' },
  { key: 'response', label: 'Response — what runs', kind: 'multiline', group: 'Response' },
  { key: 'channel', label: 'Channel', kind: 'ref', group: 'Response' },
  { key: 'audience', label: 'Audience', kind: 'ref', group: 'Response' },
  { key: 'status', label: 'Status', kind: 'status', group: 'State' },
  { key: 'notes', label: 'Notes', kind: 'multiline', group: 'State' },
]

export const TRIGGER_STATUSES: NonNullable<Trigger['status']>[] = ['active', 'paused', 'draft']

export function freshTriggerId(): string {
  return freshRecordId('trg')
}
