import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Concept record — Records › Message › Concepts. The big idea a campaign is built on: the line it
 * argues, the insight underneath it, and the reference it should feel like.
 *
 * A concept and a message are not the same thing, and the fields keep them apart. A Message is a
 * CLAIM you make to an audience ("one system instead of five"). A Concept is the IDEA the work is
 * built from, which usually outlives any one claim and often carries the tone — the reason a card
 * for it already had `likeThis` as direction while a Message card had `notThis`.
 *
 * Hand-editable; seed nothing invented.
 */
export interface Concept {
  id: string
  /** Which brand's workspace this record belongs to (scoped by the rail). Untagged = shows for all. */
  brand?: string
  name: string
  /** The big idea, in one line. */
  idea?: string
  /** The truth underneath it — why anyone should care that it is true. */
  insight?: string
  /** The reference to write toward: a piece of work, a register, a feeling. */
  likeThis?: string
  /** Loosely joined to the brand's audiences by name, as Message and Product already are. */
  audience?: string
  status?: 'draft' | 'approved' | 'retired' | ''
  notes?: string
}

export const CONCEPT_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Concept', kind: 'name', width: 220, group: 'Concept' },
  { key: 'idea', label: 'The idea', kind: 'text', width: 260, group: 'Concept' },
  { key: 'insight', label: 'Insight', kind: 'text', width: 220, group: 'Concept' },
  { key: 'likeThis', label: 'Like this', kind: 'text', width: 200, group: 'Feel' },
  { key: 'audience', label: 'Audience', kind: 'ref', width: 160, group: 'Fit' },
  { key: 'status', label: 'Status', kind: 'status', width: 120, group: 'State' },
]

export const CONCEPT_FIELDS: RecordField[] = [
  { key: 'name', label: 'Concept', kind: 'name', group: 'Concept' },
  { key: 'idea', label: 'The idea', kind: 'multiline', group: 'Concept' },
  { key: 'insight', label: 'The insight under it', kind: 'multiline', group: 'Concept' },
  { key: 'likeThis', label: 'Like this', kind: 'text', group: 'Feel' },
  { key: 'audience', label: 'Audience', kind: 'ref', group: 'Fit' },
  { key: 'status', label: 'Status', kind: 'status', group: 'State' },
  { key: 'notes', label: 'Notes', kind: 'multiline', group: 'State' },
]

export const freshConceptId = (): string => freshRecordId('cpt')
