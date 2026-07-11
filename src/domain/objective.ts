import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * An Objective record — Records › Message › Objectives. What a campaign is trying to move and how
 * it's measured. Hand-editable; nothing seeded so targets aren't invented.
 */
export interface Objective {
  id: string
  name: string
  metric?: string
  target?: string
  timeframe?: string
  owner?: string
  status?: 'planned' | 'in progress' | 'hit' | 'missed' | ''
  notes?: string
}

export const OBJECTIVE_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Objective', kind: 'name', width: 260, group: 'Goal' },
  { key: 'metric', label: 'Metric', kind: 'text', width: 180, group: 'Measure' },
  { key: 'target', label: 'Target', kind: 'text', width: 140, group: 'Measure' },
  { key: 'timeframe', label: 'Timeframe', kind: 'text', width: 150, group: 'Measure' },
  { key: 'status', label: 'Status', kind: 'status', width: 130, group: 'State' },
]

export const OBJECTIVE_FIELDS: RecordField[] = [
  { key: 'name', label: 'Objective', kind: 'name', group: 'Goal' },
  { key: 'metric', label: 'Metric', kind: 'text', group: 'Measure' },
  { key: 'target', label: 'Target', kind: 'text', group: 'Measure' },
  { key: 'timeframe', label: 'Timeframe', kind: 'text', group: 'Measure' },
  { key: 'owner', label: 'Owner', kind: 'text', group: 'State' },
  { key: 'status', label: 'Status', kind: 'status', group: 'State' },
  { key: 'notes', label: 'Notes', kind: 'multiline', group: 'State' },
]

export const OBJECTIVE_STATUSES: NonNullable<Objective['status']>[] = ['planned', 'in progress', 'hit', 'missed']

export function freshObjectiveId(): string {
  return freshRecordId('obj')
}
