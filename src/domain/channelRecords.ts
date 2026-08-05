import { CHANNEL_LIST } from './channels'
import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Channel record — the "Records › Channels" table. Seeded once from the full channel
 * taxonomy (every paid / organic / owned channel the tool knows), with planning
 * benchmarks (CPM / CTR / CVR) pre-filled for the channels we have data for. Text-only
 * so the table stays hand-editable; persisted as a plain array in localStorage.
 */
export interface ChannelRecord {
  id: string
  name: string
  type?: 'paid' | 'organic' | 'owned' | 'sales' | ''
  platform?: string
  /** $ per 1000 impressions. */
  cpm?: string
  /** Click-through rate, %. */
  ctr?: string
  /** Conversion rate, %. */
  cvr?: string
  formats?: string
  notes?: string
}

/** Platform pick-list — the distinct platforms across the channel taxonomy. */
export const CHANNEL_PLATFORM_OPTIONS: readonly string[] = [...new Set(CHANNEL_LIST.map((c) => c.platform))].sort()

export const CHANNEL_RECORD_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Channel', kind: 'name', width: 200, group: 'Channel' },
  { key: 'type', label: 'Type', kind: 'status', width: 110, group: 'Channel' },
  { key: 'platform', label: 'Platform', kind: 'text', width: 140, group: 'Channel', options: CHANNEL_PLATFORM_OPTIONS },
  { key: 'cpm', label: 'CPM $', kind: 'text', width: 100, group: 'Benchmarks' },
  { key: 'ctr', label: 'CTR %', kind: 'text', width: 100, group: 'Benchmarks' },
  { key: 'cvr', label: 'CVR %', kind: 'text', width: 100, group: 'Benchmarks' },
  { key: 'formats', label: 'Formats', kind: 'text', width: 200, group: 'Delivery' },
]

export const CHANNEL_RECORD_FIELDS: RecordField[] = [
  { key: 'name', label: 'Channel', kind: 'name', group: 'Channel' },
  { key: 'type', label: 'Type', kind: 'status', group: 'Channel' },
  { key: 'platform', label: 'Platform', kind: 'text', group: 'Channel', options: CHANNEL_PLATFORM_OPTIONS },
  { key: 'cpm', label: 'CPM $', kind: 'text', group: 'Benchmarks' },
  { key: 'ctr', label: 'CTR %', kind: 'text', group: 'Benchmarks' },
  { key: 'cvr', label: 'CVR %', kind: 'text', group: 'Benchmarks' },
  { key: 'formats', label: 'Accepted formats', kind: 'text', group: 'Delivery' },
  { key: 'notes', label: 'Notes', kind: 'multiline', group: 'Delivery' },
]

export const CHANNEL_RECORD_STATUSES: NonNullable<ChannelRecord['type']>[] = ['paid', 'organic', 'owned', 'sales']

export function freshChannelRecordId(): string {
  return freshRecordId('ch')
}

// Planning benchmarks for the channels we have data for (mid-range 2026 defaults); other
// channels seed blank and are filled by the user. CTR/CVR shown as percentages.
const BENCH: Record<string, { cpm: number; ctr: number; cvr: number }> = {
  'meta-ads': { cpm: 9, ctr: 1.1, cvr: 2 },
  'youtube-ads': { cpm: 12, ctr: 0.7, cvr: 1.2 },
  'tiktok-ads': { cpm: 7, ctr: 1, cvr: 1.2 },
  'google-search': { cpm: 38, ctr: 3.5, cvr: 4.5 },
  'linkedin-ads': { cpm: 33, ctr: 0.5, cvr: 2.8 },
  email: { cpm: 2, ctr: 2.5, cvr: 5 },
}

/** The initial channels list: every channel in the taxonomy, benchmarks pre-filled where known. */
export function seedChannelRecords(): ChannelRecord[] {
  return CHANNEL_LIST.map((c) => {
    const b = BENCH[c.id]
    return {
      id: freshChannelRecordId(),
      name: c.label,
      type: c.kind,
      platform: c.platform,
      cpm: b ? String(b.cpm) : '',
      ctr: b ? String(b.ctr) : '',
      cvr: b ? String(b.cvr) : '',
      formats: (c.accepts ?? []).join(', '),
    }
  })
}
