import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Message record — Records › Message › Messages. A reusable message / angle the brand returns to,
 * tied to the audience it lands with and the proof behind it. Hand-editable; seed nothing invented.
 */
export interface Message {
  id: string
  /** Which brand's workspace this record belongs to (scoped by the rail). Untagged = shows for all. */
  brand?: string
  name: string
  angle?: string
  audience?: string
  pillar?: string
  proof?: string
  stage?: 'awareness' | 'consideration' | 'conversion' | ''
  status?: 'draft' | 'approved' | 'retired' | ''
  notes?: string
}

export const MESSAGE_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Message', kind: 'name', width: 240, group: 'Message' },
  { key: 'angle', label: 'Angle', kind: 'text', width: 220, group: 'Message' },
  { key: 'audience', label: 'Audience', kind: 'text', width: 160, group: 'Fit' },
  { key: 'pillar', label: 'Pillar', kind: 'text', width: 150, group: 'Fit' },
  { key: 'stage', label: 'Funnel stage', kind: 'text', width: 140, group: 'Fit' },
  { key: 'status', label: 'Status', kind: 'status', width: 120, group: 'State' },
]

export const MESSAGE_FIELDS: RecordField[] = [
  { key: 'name', label: 'Message', kind: 'name', group: 'Message' },
  { key: 'angle', label: 'Angle', kind: 'multiline', group: 'Message' },
  { key: 'proof', label: 'Proof behind it', kind: 'multiline', group: 'Message' },
  { key: 'audience', label: 'Audience', kind: 'text', group: 'Fit' },
  { key: 'pillar', label: 'Pillar', kind: 'text', group: 'Fit' },
  { key: 'stage', label: 'Funnel stage', kind: 'text', group: 'Fit' },
  { key: 'status', label: 'Status', kind: 'status', group: 'State' },
  { key: 'notes', label: 'Notes', kind: 'multiline', group: 'State' },
]

export const MESSAGE_STATUSES: NonNullable<Message['status']>[] = ['draft', 'approved', 'retired']

export function freshMessageId(): string {
  return freshRecordId('msg')
}
