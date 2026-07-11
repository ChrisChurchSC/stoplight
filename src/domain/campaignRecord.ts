import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Campaign planning record — Records › Activation › Campaigns. A lightweight planning row for a
 * campaign (distinct from a built Flow): what it's for, who it targets, where it runs. Hand-editable.
 */
export interface CampaignRecord {
  id: string
  name: string
  goal?: string
  audience?: string
  channels?: string
  budget?: string
  start?: string
  end?: string
  owner?: string
  status?: 'planning' | 'live' | 'done' | 'paused' | ''
  notes?: string
}

export const CAMPAIGN_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Campaign', kind: 'name', width: 220, group: 'Plan' },
  { key: 'goal', label: 'Goal', kind: 'text', width: 200, group: 'Plan' },
  { key: 'audience', label: 'Audience', kind: 'text', width: 160, group: 'Targeting' },
  { key: 'channels', label: 'Channels', kind: 'text', width: 170, group: 'Targeting' },
  { key: 'budget', label: 'Budget', kind: 'text', width: 120, group: 'Run' },
  { key: 'status', label: 'Status', kind: 'status', width: 130, group: 'Run' },
]

export const CAMPAIGN_FIELDS: RecordField[] = [
  { key: 'name', label: 'Campaign', kind: 'name', group: 'Plan' },
  { key: 'goal', label: 'Goal', kind: 'multiline', group: 'Plan' },
  { key: 'audience', label: 'Audience', kind: 'text', group: 'Targeting' },
  { key: 'channels', label: 'Channels', kind: 'multiline', group: 'Targeting' },
  { key: 'budget', label: 'Budget', kind: 'text', group: 'Run' },
  { key: 'start', label: 'Start', kind: 'text', group: 'Run' },
  { key: 'end', label: 'End', kind: 'text', group: 'Run' },
  { key: 'owner', label: 'Owner', kind: 'text', group: 'Run' },
  { key: 'status', label: 'Status', kind: 'status', group: 'Run' },
  { key: 'notes', label: 'Notes', kind: 'multiline', group: 'Run' },
]

export const CAMPAIGN_STATUSES: NonNullable<CampaignRecord['status']>[] = ['planning', 'live', 'done', 'paused']

export function freshCampaignRecordId(): string {
  return freshRecordId('camp')
}
