import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Voice record — Records › Foundation › Voices. A brand voice / tone-of-voice profile the copy
 * gets written in (e.g. "Founder voice", "Playful", "Authoritative"). The AI draws on these when
 * generating on-brand copy, so each carries its tone, do's/don'ts, and a sample. Hand-editable.
 */
export interface Voice {
  id: string
  /** Which brand's workspace this record belongs to (scoped by the rail). Untagged = shows for all. */
  brand?: string
  name: string
  summary?: string
  tone?: string
  dos?: string
  donts?: string
  sample?: string
  useFor?: string
  status?: 'active' | 'draft' | 'archived' | ''
  notes?: string
}

export const VOICE_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Voice', kind: 'name', width: 200, group: 'Voice' },
  { key: 'tone', label: 'Tone', kind: 'text', width: 240, group: 'Voice' },
  { key: 'useFor', label: 'Use for', kind: 'text', width: 200, group: 'Fit' },
  { key: 'status', label: 'Status', kind: 'status', width: 120, group: 'State' },
]

export const VOICE_FIELDS: RecordField[] = [
  { key: 'name', label: 'Voice', kind: 'name', group: 'Voice' },
  { key: 'summary', label: 'Summary', kind: 'multiline', group: 'Voice' },
  { key: 'tone', label: 'Tone', kind: 'text', group: 'Voice' },
  { key: 'dos', label: "Do's", kind: 'multiline', group: 'Guidance' },
  { key: 'donts', label: "Don'ts", kind: 'multiline', group: 'Guidance' },
  { key: 'sample', label: 'Sample', kind: 'multiline', group: 'Guidance' },
  { key: 'useFor', label: 'Use for', kind: 'text', group: 'Fit' },
  { key: 'status', label: 'Status', kind: 'status', group: 'State' },
  { key: 'notes', label: 'Notes', kind: 'multiline', group: 'State' },
]

export const VOICE_STATUSES: NonNullable<Voice['status']>[] = ['active', 'draft', 'archived']

export function freshVoiceId(): string {
  return freshRecordId('voice')
}
