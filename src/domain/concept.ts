import { freshRecordId } from './records'

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

export const freshConceptId = (): string => freshRecordId('cpt')
