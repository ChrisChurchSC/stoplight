import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Person record — the "Records › People" table, the contacts side of the lightweight
 * CRM. Same hand-editable, no-fabrication approach as Companies: seed only names, roles,
 * and the company they belong to; leave email/location blank for the user to fill.
 */
export interface Person {
  id: string
  /** Which brand's workspace this record belongs to (scoped by the rail). Untagged = shows for all. */
  brand?: string
  name: string
  title?: string
  company?: string
  email?: string
  location?: string
  status?: 'lead' | 'contact' | 'champion' | ''
  phone?: string
  linkedin?: string
  owner?: string
  notes?: string
}

export const PEOPLE_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Name', kind: 'name', width: 200, group: 'Identity' },
  { key: 'title', label: 'Title', kind: 'text', width: 180, group: 'Identity' },
  { key: 'company', label: 'Company', kind: 'text', width: 160, group: 'Identity' },
  { key: 'status', label: 'Status', kind: 'status', width: 120, group: 'Identity' },
  { key: 'email', label: 'Email', kind: 'text', width: 220, group: 'Contact' },
  { key: 'location', label: 'Location', kind: 'text', width: 150, group: 'Contact' },
]

// The full attribute set shown in a person's detail panel (a superset of the columns).
export const PEOPLE_FIELDS: RecordField[] = [
  { key: 'name', label: 'Name', kind: 'name', group: 'Identity' },
  { key: 'title', label: 'Title', kind: 'text', group: 'Identity' },
  { key: 'company', label: 'Company', kind: 'text', group: 'Identity' },
  { key: 'status', label: 'Status', kind: 'status', group: 'Identity' },
  { key: 'email', label: 'Email', kind: 'text', group: 'Contact' },
  { key: 'phone', label: 'Phone', kind: 'text', group: 'Contact' },
  { key: 'linkedin', label: 'LinkedIn', kind: 'url', group: 'Contact' },
  { key: 'location', label: 'Location', kind: 'text', group: 'Contact' },
  { key: 'owner', label: 'Relationship owner', kind: 'text', group: 'Relationship' },
  { key: 'notes', label: 'Notes', kind: 'multiline', group: 'Relationship' },
]

export const PEOPLE_STATUSES: NonNullable<Person['status']>[] = ['lead', 'contact', 'champion']

export function freshPersonId(): string {
  return freshRecordId('pe')
}

// Seed drawn from real, publicly-known client contacts — names, roles, and company only.
// Emails and locations are left blank so nothing is invented.
const SEED: Omit<Person, 'id'>[] = [
  { name: 'Jonathan Shooshani', title: 'President', company: 'Joon', status: 'contact' },
  { name: 'Sebastian Elghanian', title: 'CEO', company: 'Joon', status: 'contact' },
]

export function seedPeople(): Person[] {
  return SEED.map((p) => ({ ...p, id: freshPersonId() }))
}
