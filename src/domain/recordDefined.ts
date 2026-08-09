import type { ObjectReference } from './objectReference'
import { recordDetail } from './recordDetail'

/**
 * IS THIS RECORD ACTUALLY A RECORD, or just a name?
 *
 * A name is a label, not a definition. Generation mints records as it needs them — an audience the
 * copy targets, a message the builder names — and those arrive carrying the one thing the writer
 * had at the time, which is the name. Left unfilled they accumulate into a library of nouns: a
 * picker offering "Coastal Trip Planners" and "Great Lakes Boaters" with nothing underneath either
 * one, where choosing between them means already knowing what they are, and the copy written from
 * either is written from a string.
 *
 * SO A RECORD IS DEFINED WHEN IT SAYS SOMETHING BEYOND ITS OWN NAME: the one line its kind shows
 * under it (recordDetail — the same line every picker in the app prints, so this cannot drift from
 * what is on screen), or a document attached to it, which is the other way of saying the same thing
 * at length.
 *
 * Deliberately not "every field is full". Records are meant to be filled in over time and a
 * half-written audience is still a real audience; the line this draws is between a record that
 * defines something and a record that is only a label.
 *
 * A KIND WITH NO LINE OF ITS OWN CANNOT FAIL THIS. recordDetail omits kinds whose records carry no
 * prose (a data set says what it is by its shape), and inventing a test for them here would mark
 * every one of them undefined for a rule that was never about them.
 */

/** The kinds recordDetail can speak for. Others are exempt; see above. */
export type DefinableKind = keyof typeof recordDetail

/**
 * `unknown` rather than a record type: every kind's interface is a different shape, none of them
 * carries an index signature, and this reads defensively anyway — so a narrow parameter type would
 * buy nothing and cost a cast at all eleven call sites.
 */
export function hasDefinition(kind: string, record: unknown): boolean {
  if (!record || typeof record !== 'object') return false
  const ref = (record as { reference?: ObjectReference }).reference
  // A document IS the definition, and the longest form of one. It is checked first because a record
  // given its brief as a .md may legitimately carry nothing in its own fields.
  if (ref?.text?.trim()) return true
  const read = (recordDetail as Record<string, ((r: unknown) => string | undefined) | undefined>)[kind]
  // No line for this kind: not a thing this rule can judge, so it passes.
  if (!read) return true
  try {
    return !!read(record)?.trim()
  } catch {
    // A malformed record is not evidence of a definition, but it is not this function's business
    // to throw inside a list render either.
    return false
  }
}

/** The records in a list that are only a name. */
export function undefinedRecords<T>(kind: string, records: readonly T[]): T[] {
  return records.filter((r) => !hasDefinition(kind, r))
}
