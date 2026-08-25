import { describe, expect, it } from 'vitest'
import { normalizeScheduleInput } from '../scheduleInput'

/**
 * THE ZONE A DATE IS READ IN, which JS decides for you differently depending on whether a time is
 * present: Date.parse('2026-09-03') is UTC midnight, new Date('2026-09-03T09:00') is 9am local.
 * These assert the LOCAL reading of a naked input rather than the ISO text, because the text is
 * correct under either rule and only the wall-clock reading tells them apart.
 */

const localParts = (iso: string) => {
  const d = new Date(iso)
  return {
    day: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: d.toTimeString().slice(0, 8),
  }
}

describe('a date that carries its own offset', () => {
  it('is taken at its word and stored normalized', () => {
    expect(normalizeScheduleInput('2026-09-03T09:00:00Z', 'scheduledAt')).toBe('2026-09-03T09:00:00.000Z')
  })

  it('accepts a numeric offset, resolving to the same instant', () => {
    expect(normalizeScheduleInput('2026-09-03T11:00:00+02:00', 'scheduledAt')).toBe('2026-09-03T09:00:00.000Z')
  })
})

describe('a date with no offset', () => {
  it('reads a naked time as local wall clock, not UTC', () => {
    const { day, time } = localParts(normalizeScheduleInput('2026-09-03T09:00', 'scheduledAt')!)
    expect(day).toBe('2026-09-03')
    expect(time).toBe('09:00:00')
  })

  it('reads a bare day as LOCAL midnight — the trap Date.parse sets', () => {
    // Date.parse('2026-09-03') is UTC midnight by spec, which is Sept 2nd for anyone west of
    // Greenwich. This is the single reason the function exists.
    const { day, time } = localParts(normalizeScheduleInput('2026-09-03', 'scheduledAt')!)
    expect(day).toBe('2026-09-03')
    expect(time).toBe('00:00:00')
  })

  it('keeps seconds when they are given', () => {
    expect(localParts(normalizeScheduleInput('2026-09-03T09:00:30', 'scheduledAt')!).time).toBe('09:00:30')
  })
})

describe('clearing, which is a write and not an omission', () => {
  it('reads null as "no date"', () => {
    expect(normalizeScheduleInput(null, 'scheduledAt')).toBeNull()
  })
})

describe('what it refuses, loudly', () => {
  it('rejects a day the calendar does not have instead of rolling it into March', () => {
    expect(() => normalizeScheduleInput('2026-02-31', 'scheduledAt')).toThrow(/not a date I can read/)
  })

  it('rejects prose, an empty string, and a non-string', () => {
    expect(() => normalizeScheduleInput('next tuesday', 'scheduledAt')).toThrow(/not a date I can read/)
    expect(() => normalizeScheduleInput('', 'scheduledAt')).toThrow(/not a date I can read/)
    expect(() => normalizeScheduleInput(1758000000000, 'scheduledAt')).toThrow(/not a date I can read/)
  })

  it('rejects an impossible clock rather than rolling into the next day', () => {
    expect(() => normalizeScheduleInput('2026-09-03T25:00', 'scheduledAt')).toThrow(/not a date I can read/)
    expect(() => normalizeScheduleInput('2026-09-03T09:70', 'scheduledAt')).toThrow(/not a date I can read/)
  })

  it('never quietly falls back to now, which would be indistinguishable from a real choice', () => {
    expect(() => normalizeScheduleInput('garbage', 'scheduledAt')).toThrow()
  })

  it('names the field, so a caller knows which of two dates it got wrong', () => {
    expect(() => normalizeScheduleInput('nope', 'publishedAt')).toThrow(/^publishedAt is not a date/)
  })
})
