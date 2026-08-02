import { freshRecordId } from './records'

/**
 * A Season record — Records › Message › Seasons. A moment worth writing to: a date, a period, or a
 * recurring event the audience already has in mind.
 *
 * A season is not a trigger, and the fields keep them apart. A Trigger fires per person, from a
 * signal about THEM ("their kit broke"), so it starts a journey. A season is on the calendar and it
 * is the same for everyone, so it opens a WINDOW: it gives you permission to write about something
 * you would otherwise be interrupting with. That is why the card's direction was always moment +
 * permission rather than the trigger's justDid + ask.
 *
 * `window` is prose, not dates. A season is "the fortnight before the season opens" more often than
 * it is a pair of timestamps, and a real date range belongs on the flight, which already has one.
 *
 * Hand-editable; seed nothing invented.
 */
export interface Season {
  id: string
  /** Which brand's workspace this record belongs to (scoped by the rail). Untagged = shows for all. */
  brand?: string
  name: string
  /** The moment itself, in one line. */
  moment?: string
  /** Why this moment lets you say something you otherwise could not. */
  permission?: string
  /** When it runs, in words: "the fortnight before the season opens". */
  window?: string
  /** What the audience is already doing or feeling then. */
  mindset?: string
  /** Loosely joined to the brand's audiences by name, as Message, Concept and Product already are. */
  audience?: string
  status?: 'draft' | 'approved' | 'retired' | ''
  notes?: string
}

export const freshSeasonId = (): string => freshRecordId('ssn')
