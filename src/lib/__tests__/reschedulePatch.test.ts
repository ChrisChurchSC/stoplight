// @vitest-environment jsdom
// The function under test is pure; the pragma is for its module, which reaches the store (and so
// localStorage) at import. Kept beside the `ymd` it inverts, which is worth one line of setup.

import { describe, expect, it } from 'vitest'
import { reschedulePatch } from '../assetTasks'

/**
 * MOVING A TASK'S DATE MOVES AN ASSET'S LAUNCH, AND MUST MOVE NOTHING ELSE.
 *
 * The Tasks drawer shows a date input; the thing behind it is a moment on a schedule. Every one of
 * these is a way that gap has to be crossed carefully, and every one of them fails quietly — the
 * date shown afterwards looks right in each case, and the damage is to a time nobody is looking at.
 *
 * The round trip is asserted with the same `ymd` the list itself derives `due` with, rather than by
 * reading the ISO string: the ISO string is UTC, `due` is a local calendar day, and a patch that
 * agrees with one while disagreeing with the other is exactly the bug worth catching.
 */

const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const timeOfDay = (iso: string) => new Date(iso).toTimeString().slice(0, 8)

describe('reschedulePatch', () => {
  it('lands on the day that was picked, read back the way the list reads it', () => {
    // Not `toContain('2026-09-03')` — that passes on a UTC string that is the 2nd locally.
    const p = reschedulePatch({ scheduledAt: '2026-08-10T12:30:00.000Z' }, '2026-09-03')!
    expect(localDay(p.scheduledAt)).toBe('2026-09-03')
  })

  it('keeps the time of day, so a campaign’s staggered posts do not collapse onto midnight', () => {
    const at = '2026-08-10T12:30:00.000Z'
    const p = reschedulePatch({ scheduledAt: at }, '2026-09-03')!
    expect(timeOfDay(p.scheduledAt)).toBe(timeOfDay(at))
  })

  it('moves both ends of a flight together, keeping its length', () => {
    const p = reschedulePatch({ scheduledAt: '2026-08-10T12:30:00.000Z', endsAt: '2026-08-17T12:30:00.000Z' }, '2026-09-03')!
    const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
    expect(days(p.scheduledAt, p.endsAt!), 'still seven days long').toBe(7)
    expect(localDay(p.endsAt!)).toBe('2026-09-10')
  })

  it('does not invent an end for a row that never had one', () => {
    const p = reschedulePatch({ scheduledAt: '2026-08-10T12:30:00.000Z' }, '2026-09-03')!
    expect(p.endsAt).toBeUndefined()
  })

  it('crosses a month boundary rather than clamping inside the old month', () => {
    // Setting all three at once cannot overflow. Setting the MONTH first can: Jan 31 with the month
    // moved to February is March 3, and the day set afterwards lands in the wrong month entirely.
    // (Day-first happens to survive, so this pins the ordering rather than the number of calls.)
    const p = reschedulePatch({ scheduledAt: '2026-01-31T09:00:00.000Z' }, '2026-02-15')!
    expect(localDay(p.scheduledAt)).toBe('2026-02-15')
  })

  it('treats an emptied input as nothing to do, not as a date of zero', () => {
    expect(reschedulePatch({ scheduledAt: '2026-08-10T12:30:00.000Z' }, '')).toBeNull()
    expect(reschedulePatch({ scheduledAt: '2026-08-10T12:30:00.000Z' }, 'not-a-date')).toBeNull()
  })

  it('still schedules an asset that had no date at all', () => {
    const p = reschedulePatch({}, '2026-09-03')!
    expect(localDay(p.scheduledAt)).toBe('2026-09-03')
  })
})
