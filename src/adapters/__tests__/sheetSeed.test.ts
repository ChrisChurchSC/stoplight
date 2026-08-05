// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { MockSheetAdapter } from '../sheet/mockSheetAdapter'
import type { TrafficRow } from '../../domain/types'

/**
 * THE FIRST PAINT MUST ALREADY HAVE THE WORKSPACE IN IT.
 *
 * `refresh()` is kicked off from an effect in Workbench, and effects run after paint. So for as
 * long as `rows` could only be filled by that async read, the first painted frame was guaranteed
 * to run on `rows: []` — and every rows-derived surface rendered its "you have nothing" state
 * before the real content replaced it. On the Campaigns page that meant the count read
 * "0 campaigns", the Start-a-campaign hint opened over a workspace that already had campaigns in
 * it, and the campaign cards with their channel counts appeared a frame later. It read as the
 * page loading badly, because it was.
 *
 * localStorage is synchronous, so that wait bought nothing: the only reason the store could not
 * have the rows at creation was that the adapter's single read was wrapped in a Promise. `listSync`
 * is that same read, unwrapped, and the store seeds `rows` from it (see seedRows in
 * useTrafficStore).
 *
 * These pin the two things the seed depends on: that the synchronous read agrees exactly with the
 * async one, and that it never throws on a workspace it cannot parse — a seed that throws would
 * take the whole store module down at import, which is a much worse failure than a slow paint.
 *
 * The network-backed adapter deliberately has no `listSync`; there the rows really are a round
 * trip away, and `rowsHydrated` is what keeps the empty states honest until they land.
 */

const STORAGE_KEY = 'stoplight.sheet.v1'

const row = (id: string, channel: string): TrafficRow =>
  ({ id, channel, campaign: 'Spring Launch', status: 'draft' }) as unknown as TrafficRow

describe('the synchronous first read', () => {
  beforeEach(() => localStorage.clear())

  it('returns exactly what the async read returns', async () => {
    const rows = [row('r1', 'instagram'), row('r2', 'linkedin')]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows }))
    const sheet = new MockSheetAdapter()
    expect(sheet.listSync()).toEqual(await sheet.list())
  })

  it('sees a write the async read would see', async () => {
    const sheet = new MockSheetAdapter()
    await sheet.append([row('r1', 'instagram')])
    expect(sheet.listSync().map((r) => r.id)).toEqual(['r1'])
  })

  it('answers empty for a workspace that has never been written to', () => {
    expect(new MockSheetAdapter().listSync()).toEqual([])
  })

  it('answers empty rather than throwing on unparseable storage', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(() => new MockSheetAdapter().listSync()).not.toThrow()
    expect(new MockSheetAdapter().listSync()).toEqual([])
  })

  /**
   * The snapshot is `{ rows: [...] }`, never a bare array — writing a bare array is a known way to
   * empty every canvas — so a shape that isn't the snapshot reads as empty instead of as rows.
   */
  it('answers empty when the stored shape is not a snapshot', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([row('r1', 'instagram')]))
    expect(new MockSheetAdapter().listSync()).toEqual([])
  })
})
