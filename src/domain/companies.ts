import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Company record — the "Records › Companies" table, a lightweight CRM object over
 * the agency's clients and prospects. Text-only fields kept deliberately simple so the
 * table stays hand-editable; no fabricated metrics (founded/country start blank and are
 * filled by the user or an import). Persisted as a plain array in localStorage.
 */
export interface Company {
  id: string
  name: string
  description?: string
  website?: string
  segment?: string
  founded?: string
  country?: string
  status?: 'client' | 'prospect' | 'partner' | ''
  employees?: string
  phone?: string
  linkedin?: string
  owner?: string
  notes?: string
}

export const COMPANY_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Company', kind: 'name', width: 220, group: 'Profile' },
  { key: 'description', label: 'Description', kind: 'text', width: 300, group: 'Profile' },
  { key: 'status', label: 'Status', kind: 'status', width: 120, group: 'Profile' },
  { key: 'segment', label: 'Segment', kind: 'text', width: 160, group: 'Firmographics' },
  { key: 'website', label: 'Website', kind: 'url', width: 180, group: 'Firmographics' },
  { key: 'country', label: 'Country', kind: 'text', width: 150, group: 'Firmographics' },
  { key: 'founded', label: 'Founded', kind: 'text', width: 110, group: 'Firmographics' },
]

// The full attribute set shown in a company's detail panel (a superset of the columns).
export const COMPANY_FIELDS: RecordField[] = [
  { key: 'name', label: 'Company', kind: 'name', group: 'Profile' },
  { key: 'status', label: 'Status', kind: 'status', group: 'Profile' },
  { key: 'description', label: 'Description', kind: 'multiline', group: 'Profile' },
  { key: 'segment', label: 'Segment', kind: 'text', group: 'Firmographics' },
  { key: 'website', label: 'Website', kind: 'url', group: 'Firmographics' },
  { key: 'linkedin', label: 'LinkedIn', kind: 'url', group: 'Firmographics' },
  { key: 'employees', label: 'Employees', kind: 'text', group: 'Firmographics' },
  { key: 'founded', label: 'Founded', kind: 'text', group: 'Firmographics' },
  { key: 'country', label: 'Country / HQ', kind: 'text', group: 'Firmographics' },
  { key: 'phone', label: 'Phone', kind: 'text', group: 'Relationship' },
  { key: 'owner', label: 'Account owner', kind: 'text', group: 'Relationship' },
  { key: 'notes', label: 'Notes', kind: 'multiline', group: 'Relationship' },
]

export const COMPANY_STATUSES: NonNullable<Company['status']>[] = ['client', 'prospect', 'partner']

export function freshCompanyId(): string {
  return freshRecordId('co')
}

// Seed drawn from the agency's real, known clients — names, sites, and one-line
// descriptions only. Quantitative fields (founded / country) are intentionally left
// blank so nothing here is invented; the user fills or imports them.
const SEED: Omit<Company, 'id'>[] = [
  {
    name: 'World Within',
    description: 'Impact media movement backing community-owned businesses.',
    website: 'worldwithin.org',
    segment: 'Nonprofit / Media',
    status: 'client',
  },
  {
    name: 'Photon Health',
    description: 'Prescription routing and pharmacy fulfillment platform.',
    website: 'photonhealth.com',
    segment: 'Health tech',
    status: 'client',
  },
  {
    name: 'Joon',
    description: 'Local Services Ads management platform for home-service pros.',
    website: 'joon.io',
    segment: 'Ad tech',
    status: 'client',
  },
  {
    name: 'Oxyle',
    description: 'Swiss PFAS water-treatment technology.',
    website: 'oxyle.com',
    segment: 'Cleantech',
    status: 'client',
  },
]

/**
 * The initial companies list: the curated real clients, merged with any brand already
 * live in this workspace (deduped by name) so the table opens populated with real rows.
 */
export function seedCompanies(brandNames: string[]): Company[] {
  const rows: Company[] = SEED.map((c) => ({ ...c, id: freshCompanyId() }))
  const have = new Set(rows.map((r) => r.name.toLowerCase()))
  for (const name of brandNames) {
    const n = name.trim()
    if (!n || have.has(n.toLowerCase())) continue
    have.add(n.toLowerCase())
    rows.push({ id: freshCompanyId(), name: n, status: 'client' })
  }
  return rows
}
