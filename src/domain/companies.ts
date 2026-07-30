import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Company record — the "Records › Companies" table, a lightweight CRM object over
 * the agency's clients and prospects. Text-only fields kept deliberately simple so the
 * table stays hand-editable; no fabricated metrics (founded/country start blank and are
 * filled by the user or an import). Persisted as a plain array in localStorage.
 */
export interface Company {
  id: string
  /** Which brand's workspace this record belongs to (scoped by the rail). Untagged = shows for all. */
  brand?: string
  name: string
  description?: string
  website?: string
  segment?: string
  /** Which of the active brand's audience segments (personas) this account belongs to. Picked from
   *  the Segments records, so it joins Companies ↔ Segments; scoped to the brand in view. */
  audienceSegment?: string
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
  { key: 'audienceSegment', label: 'Audience segment', kind: 'ref', width: 190, group: 'Targeting' },
  { key: 'segment', label: 'Segment', kind: 'ref', width: 160, group: 'Firmographics' },
  { key: 'website', label: 'Website', kind: 'url', width: 180, group: 'Firmographics' },
  { key: 'country', label: 'Country', kind: 'text', width: 150, group: 'Firmographics' },
  { key: 'founded', label: 'Founded', kind: 'text', width: 110, group: 'Firmographics' },
]

// The full attribute set shown in a company's detail panel (a superset of the columns).
export const COMPANY_FIELDS: RecordField[] = [
  { key: 'name', label: 'Company', kind: 'name', group: 'Profile' },
  { key: 'status', label: 'Status', kind: 'status', group: 'Profile' },
  { key: 'description', label: 'Description', kind: 'multiline', group: 'Profile' },
  { key: 'audienceSegment', label: 'Audience segment', kind: 'ref', group: 'Targeting' },
  { key: 'segment', label: 'Segment', kind: 'ref', group: 'Firmographics' },
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

/**
 * The initial companies list: only the brands already live in this workspace (deduped by
 * name), which really are this user's own accounts.
 *
 * There is deliberately no fixed seed. This ships to every workspace, so any company named
 * here would be presented to a stranger, a demo audience, or a prospect as their own record.
 * With no rows the table opens on its own empty state (a "0 companies" count and a "+ New
 * company" row), which is honest and already tells the user what to do.
 */
export function seedCompanies(brandNames: string[]): Company[] {
  const rows: Company[] = []
  const have = new Set<string>()
  for (const name of brandNames) {
    const n = name.trim()
    if (!n || have.has(n.toLowerCase())) continue
    have.add(n.toLowerCase())
    rows.push({ id: freshCompanyId(), name: n, status: 'client' })
  }
  return rows
}
