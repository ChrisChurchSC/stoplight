import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Brand record — the "Records › Brands" sheet: your own brands / clients, the entities you build
 * Flows, a Library, and Insights FOR (distinct from Audience › Companies, who you target). Backed
 * by a store slice like the other record sheets, and synced into the real client system so a named
 * brand becomes a usable workspace brand. (Distinct from domain/brand.ts, which is brand-scope.)
 */
export interface BrandRecord {
  id: string
  name: string
  industry?: string
  website?: string
  status?: 'active' | 'prospect' | 'paused' | ''
  owner?: string
  notes?: string
}

export const BRAND_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Brand', kind: 'name', width: 240, group: 'Profile' },
  { key: 'industry', label: 'Industry', kind: 'text', width: 200, group: 'Profile' },
  { key: 'website', label: 'Website', kind: 'url', width: 220, group: 'Profile' },
  { key: 'status', label: 'Status', kind: 'status', width: 130, group: 'State' },
]

export const BRAND_FIELDS: RecordField[] = [
  { key: 'name', label: 'Brand', kind: 'name', group: 'Profile' },
  { key: 'industry', label: 'Industry', kind: 'text', group: 'Profile' },
  { key: 'website', label: 'Website', kind: 'url', group: 'Profile' },
  { key: 'status', label: 'Status', kind: 'status', group: 'State' },
  { key: 'owner', label: 'Owner', kind: 'text', group: 'State' },
  { key: 'notes', label: 'Notes', kind: 'multiline', group: 'State' },
]

export const BRAND_STATUSES: NonNullable<BrandRecord['status']>[] = ['active', 'prospect', 'paused']

export function freshBrandRecordId(): string {
  return freshRecordId('brd')
}

/** Seed brand records from the real workspace brands (names + any known profile). */
export function seedBrandRecords(
  names: string[],
  profiles: Record<string, { industry?: string; website?: string }>,
): BrandRecord[] {
  return names.map((n) => ({
    id: freshBrandRecordId(),
    name: n,
    industry: profiles[n]?.industry,
    website: profiles[n]?.website,
    status: 'active' as const,
  }))
}
