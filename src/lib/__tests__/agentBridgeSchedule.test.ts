// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { runAgentAction } from '../agentBridge'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * SETTING A DATE FROM THE CONNECTOR, WHICH COULD READ ONE AND NEVER WRITE ONE.
 *
 * Every failure here is silent. A date written in UTC reads back a day early west of Greenwich; a
 * day written without its time drops a staggered campaign onto one instant; a start moved without
 * its end eventually overtakes it. In each case the card afterwards shows *a* date, which is why
 * none of them announce themselves — so these assert the day the way the app reads it (local
 * calendar day off the moment), never by matching the ISO string.
 */

let n = 0
const fresh = () => `Sched ${++n}`

const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const timeOfDay = (iso: string) => new Date(iso).toTimeString().slice(0, 8)
const dayPlus = (base: string, days: number) => {
  const [y, m, d] = base.split('-').map(Number)
  return localDay(new Date(y, m - 1, d + days).toISOString())
}

const row = (id: string) => useTrafficStore.getState().rows.find((r) => r.id === id)!

async function asset(campaign: string, assetName: string, at: string, endsAt?: string): Promise<string> {
  const r = (await runAgentAction('addAsset', {
    brand: 'Enid Blythe',
    campaign,
    channel: 'linkedin',
    assetName,
    primaryText: 'Copy',
  })) as { result: { id: string } }
  // Pin the moment, so what these assert is the move and not whatever the seeder proposed.
  await useTrafficStore.getState().updateRow(r.result.id, { scheduledAt: at, ...(endsAt ? { endsAt } : {}) })
  return r.result.id
}

beforeEach(() => {
  localStorage.clear()
})

describe('the day it lands on', () => {
  it('lands on the day asked for, read back the way the app reads it', async () => {
    const c = fresh()
    const id = await asset(c, `${c} post`, '2026-08-10T12:30:00.000Z')

    const res = await runAgentAction('scheduleAsset', { assetId: id, date: '2026-09-03' })
    expect(res.error).toBeUndefined()
    // Not toContain('2026-09-03'): that passes on a UTC string that is the 2nd locally.
    expect(localDay(row(id).scheduledAt)).toBe('2026-09-03')
  })

  it('names the timezone it read the date in, because it is the tab’s and not Desktop’s', async () => {
    const c = fresh()
    const id = await asset(c, `${c} post`, '2026-08-10T12:30:00.000Z')

    const res = (await runAgentAction('scheduleAsset', { assetId: id, date: '2026-09-03' })) as {
      result: { timezone: string; note: string }
    }
    expect(res.result.timezone).toBeTruthy()
    expect(res.result.note).toContain(res.result.timezone)
  })
})

describe('what a move carries', () => {
  it('keeps each asset’s own time of day, so re-dating a campaign does not restack it', async () => {
    const c = fresh()
    const morning = await asset(c, `${c} am`, '2026-08-10T08:15:00.000Z')
    const evening = await asset(c, `${c} pm`, '2026-08-11T19:45:00.000Z')
    const wasAm = timeOfDay(row(morning).scheduledAt)
    const wasPm = timeOfDay(row(evening).scheduledAt)
    expect(wasAm).not.toBe(wasPm)

    await runAgentAction('scheduleAsset', { campaign: c, date: '2026-09-03' })

    expect(localDay(row(morning).scheduledAt)).toBe('2026-09-03')
    expect(localDay(row(evening).scheduledAt)).toBe('2026-09-03')
    expect(timeOfDay(row(morning).scheduledAt)).toBe(wasAm)
    expect(timeOfDay(row(evening).scheduledAt)).toBe(wasPm)
  })

  it('replaces the time of day when one is actually asked for', async () => {
    const c = fresh()
    const id = await asset(c, `${c} post`, '2026-08-10T08:15:00.000Z')

    await runAgentAction('scheduleAsset', { assetId: id, date: '2026-09-03', time: '17:30' })

    expect(localDay(row(id).scheduledAt)).toBe('2026-09-03')
    expect(timeOfDay(row(id).scheduledAt)).toBe('17:30:00')
  })

  it('moves both ends of a flighted asset together, keeping its length', async () => {
    const c = fresh()
    const id = await asset(c, `${c} always-on`, '2026-08-10T09:00:00.000Z', '2026-08-24T09:00:00.000Z')
    const length = Date.parse(row(id).endsAt!) - Date.parse(row(id).scheduledAt)

    await runAgentAction('scheduleAsset', { assetId: id, date: '2026-09-03' })

    const after = row(id)
    expect(localDay(after.scheduledAt)).toBe('2026-09-03')
    expect(Date.parse(after.endsAt!) - Date.parse(after.scheduledAt)).toBe(length)
  })

  it('sets an explicit run-until when one is given', async () => {
    const c = fresh()
    const id = await asset(c, `${c} always-on`, '2026-08-10T09:00:00.000Z', '2026-08-24T09:00:00.000Z')

    await runAgentAction('scheduleAsset', { assetId: id, date: '2026-09-03', until: '2026-10-01' })

    expect(localDay(row(id).scheduledAt)).toBe('2026-09-03')
    expect(localDay(row(id).endsAt!)).toBe('2026-10-01')
  })
})

describe('spreading a batch', () => {
  it('places assets a day apart in the order they already run in', async () => {
    const c = fresh()
    const second = await asset(c, `${c} b`, '2026-08-11T10:00:00.000Z')
    const first = await asset(c, `${c} a`, '2026-08-10T10:00:00.000Z')
    const third = await asset(c, `${c} c`, '2026-08-12T10:00:00.000Z')

    await runAgentAction('scheduleAsset', { campaign: c, date: '2026-09-03', everyDays: 1 })

    // Created out of order on purpose: the walk is by existing schedule, not by insertion.
    expect(localDay(row(first).scheduledAt)).toBe('2026-09-03')
    expect(localDay(row(second).scheduledAt)).toBe(dayPlus('2026-09-03', 1))
    expect(localDay(row(third).scheduledAt)).toBe(dayPlus('2026-09-03', 2))
  })

  it('puts the whole campaign on one day when no spacing is asked for', async () => {
    const c = fresh()
    const a = await asset(c, `${c} a`, '2026-08-10T10:00:00.000Z')
    const b = await asset(c, `${c} b`, '2026-08-18T10:00:00.000Z')

    await runAgentAction('scheduleAsset', { campaign: c, date: '2026-09-03' })

    expect(localDay(row(a).scheduledAt)).toBe('2026-09-03')
    expect(localDay(row(b).scheduledAt)).toBe('2026-09-03')
  })
})

describe('what it refuses to move', () => {
  it('skips a posted asset rather than relabelling when it actually went out', async () => {
    const c = fresh()
    const live = await asset(c, `${c} live`, '2026-08-10T10:00:00.000Z')
    const draft = await asset(c, `${c} draft`, '2026-08-11T10:00:00.000Z')
    await runAgentAction('setAssetStatus', { assetId: live, status: 'posted' })
    const wentOut = row(live).scheduledAt

    const res = (await runAgentAction('scheduleAsset', { campaign: c, date: '2026-09-03' })) as {
      result: { scheduled: number; skipped: { id: string; reason: string }[] }
    }

    expect(row(live).scheduledAt).toBe(wentOut)
    expect(localDay(row(draft).scheduledAt)).toBe('2026-09-03')
    expect(res.result.scheduled).toBe(1)
    expect(res.result.skipped.map((s) => s.id)).toEqual([live])
  })

  it('says nothing moved when every asset in scope is already out', async () => {
    const c = fresh()
    const live = await asset(c, `${c} live`, '2026-08-10T10:00:00.000Z')
    await runAgentAction('setAssetStatus', { assetId: live, status: 'posted' })

    const res = (await runAgentAction('scheduleAsset', { campaign: c, date: '2026-09-03' })) as {
      result: { scheduled: number; note: string }
    }
    expect(res.result.scheduled).toBe(0)
    expect(res.result.note).toMatch(/already been posted/i)
  })
})

describe('the dates it will not accept', () => {
  it('rejects a day the calendar does not have, instead of rolling it into March', async () => {
    const c = fresh()
    const id = await asset(c, `${c} post`, '2026-08-10T10:00:00.000Z')
    const before = row(id).scheduledAt

    const res = await runAgentAction('scheduleAsset', { assetId: id, date: '2026-02-31' })
    expect(res.error).toMatch(/real calendar day/i)
    expect(row(id).scheduledAt).toBe(before)
  })

  it('rejects an end before the start', async () => {
    const c = fresh()
    const id = await asset(c, `${c} post`, '2026-08-10T10:00:00.000Z')

    const res = await runAgentAction('scheduleAsset', { assetId: id, date: '2026-09-03', until: '2026-09-01' })
    expect(res.error).toMatch(/before date/i)
  })

  it('rejects a time that is not a time', async () => {
    const c = fresh()
    const id = await asset(c, `${c} post`, '2026-08-10T10:00:00.000Z')

    const res = await runAgentAction('scheduleAsset', { assetId: id, date: '2026-09-03', time: '25:00' })
    expect(res.error).toMatch(/24-hour/i)
  })

  it('needs something to schedule', async () => {
    const res = await runAgentAction('scheduleAsset', { date: '2026-09-03' })
    expect(res.error).toMatch(/assetId, assetIds or campaign/i)
  })

  it('names an id it cannot find rather than silently moving nothing', async () => {
    const res = await runAgentAction('scheduleAsset', { assetId: 'row_nope', date: '2026-09-03' })
    expect(res.error).toMatch(/asset not found: row_nope/i)
  })
})

describe('setting a date is not setting a status', () => {
  it('leaves a draft a draft', async () => {
    const c = fresh()
    const id = await asset(c, `${c} post`, '2026-08-10T10:00:00.000Z')
    const before = row(id).status

    await runAgentAction('scheduleAsset', { assetId: id, date: '2026-09-03' })

    expect(row(id).status).toBe(before)
  })
})
