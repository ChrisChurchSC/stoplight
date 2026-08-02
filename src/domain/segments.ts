import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Segment record — the "Records › Segments" table. Segments group the accounts you sell
 * to (they mirror the `segment` field on Company records and the audiences a campaign
 * targets). Same hand-editable, no-fabrication approach as Companies and People: seed only
 * the segment names + a short description; leave counts and owners blank to fill in.
 */
export interface Segment {
  id: string
  name: string
  description?: string
  accounts?: string
  focus?: string
  owner?: string
  status?: 'active' | 'building' | 'archived' | ''
  notes?: string
}

export const SEGMENT_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Segment', kind: 'name', width: 200 },
  { key: 'description', label: 'Description', kind: 'text', width: 280 },
  { key: 'accounts', label: 'Accounts', kind: 'text', width: 120 },
  { key: 'status', label: 'Status', kind: 'status', width: 120 },
  { key: 'owner', label: 'Owner', kind: 'text', width: 150 },
]

// The full attribute set shown in a segment's detail panel (a superset of the columns).
export const SEGMENT_FIELDS: RecordField[] = [
  { key: 'name', label: 'Segment', kind: 'name' },
  { key: 'description', label: 'Description', kind: 'text' },
  { key: 'focus', label: 'Who it includes', kind: 'multiline' },
  { key: 'accounts', label: 'Accounts', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'status' },
  { key: 'owner', label: 'Owner', kind: 'text' },
  { key: 'notes', label: 'Notes', kind: 'multiline' },
]

export function freshSegmentId(): string {
  return freshRecordId('seg')
}

// Seed matches the segments already tagged on the seeded companies, so Records › Segments
// and Records › Companies stay coherent. Counts and owners are left blank (nothing invented).
const SEED: Omit<Segment, 'id'>[] = [
  { name: 'Nonprofit / Media', description: 'Mission-driven orgs and media brands', status: 'active' },
  { name: 'Health tech', description: 'Digital health and care platforms', status: 'active' },
  { name: 'Ad tech', description: 'Advertising and marketing technology', status: 'active' },
  { name: 'Cleantech', description: 'Climate, energy, and water technology', status: 'building' },
]

export function seedSegments(): Segment[] {
  return SEED.map((s) => ({ ...s, id: freshSegmentId() }))
}
