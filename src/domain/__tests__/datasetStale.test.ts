import { describe, expect, it } from 'vitest'
import { citableFigures, datasetProvenance } from '../datasetRead'
import type { BrandDataset } from '../brandDataset'

/**
 * STALENESS IS THE WINDOW THE USER PICKED.
 *
 * A 30 day pull expires in 30 days, a year pull in a year. One hardcoded number would be arbitrary
 * and undefendable to the person looking at it. A stale set stops being citable, which is stronger
 * than a warning on purpose: a figure quoted as current when its window shut months ago is wrong in
 * the one way this app must not be.
 */

const COVER_TO = '2026-03-10'
/**
 * Days after the end of coverage, measured the same way the code measures it: a date-only coverage
 * string is local noon, not UTC midnight, so that no timezone can shift the day it names.
 */
const COVER_MS = new Date(2026, 2, 10, 12).getTime()
const at = (isoDaysAfter: number): number => COVER_MS + isoDaysAfter * 86_400_000

const pulled = (windowDays: number): BrandDataset => ({
  id: 'ds_s',
  brand: 'Acme',
  name: 'Search queries',
  columns: ['Query', 'Clicks', 'Impressions', 'CTR %', 'Avg position'],
  rows: [
    ['a', '100', '1000', '10.0', '3.0'],
    ['b', '50', '800', '6.3', '5.0'],
    ['c', '10', '400', '2.5', '9.0'],
  ],
  source: {
    kind: 'aggregator',
    provider: 'summer',
    service: 'google_search_console',
    query: `gsc-queries:${windowDays}d`,
    syncedAt: COVER_MS,
    coverage: { from: '2025-12-10', to: COVER_TO },
  },
})

describe('staleness', () => {
  it('a 30 day pull is fine at 20 days and stale at 40', () => {
    expect(datasetProvenance(pulled(30), at(20)).tier).toBe('measured')
    expect(datasetProvenance(pulled(30), at(20)).citable).toBe(true)
    expect(datasetProvenance(pulled(30), at(40)).tier).toBe('stale')
    expect(datasetProvenance(pulled(30), at(40)).citable).toBe(false)
  })

  it('a 365 day pull is still fine at 40 days', () => {
    // The same age, a different verdict, because the user asked a different question.
    expect(datasetProvenance(pulled(365), at(40)).tier).toBe('measured')
  })

  it('a stale set sends no figures at all', () => {
    expect(citableFigures(pulled(30), at(40))).toEqual([])
    expect(citableFigures(pulled(30), at(20)).length).toBeGreaterThan(0)
  })

  it('says which window closed and how long ago', () => {
    const p = datasetProvenance(pulled(30), at(40))
    expect(p.detail).toContain('That window closed 10 days ago')
    expect(p.why).toContain('held back until you pull it again')
    expect(p.tone).toBe('amber')
  })

  it('measures age from coverage, not from when we asked', () => {
    // Asked today, but the rows end three months ago: stale, because the rows are what matter.
    const lagging: BrandDataset = {
      ...pulled(30),
      source: {
        kind: 'aggregator', provider: 'summer', service: 'google_search_console',
        query: 'gsc-queries:30d', syncedAt: at(0),
        coverage: { from: '2025-09-01', to: '2025-12-01' },
      },
    }
    expect(datasetProvenance(lagging, at(0)).tier).toBe('stale')
  })

  it('a sketched set is sketched, not stale, however old it is', () => {
    const sketch: BrandDataset = { ...pulled(30), source: { kind: 'composite', prompt: 'x', generatedAt: COVER_MS } }
    expect(datasetProvenance(sketch, at(400)).tier).toBe('sketched')
  })

  it('an edit beats staleness, because it is the more specific problem', () => {
    const both: BrandDataset = { ...pulled(30), editedAt: at(1), editedCells: 2 }
    expect(datasetProvenance(both, at(40)).tier).toBe('edited')
  })

  it('no dash in anything a user reads', () => {
    const p = datasetProvenance(pulled(30), at(40))
    for (const s of [p.badge, p.detail, p.why]) expect(/[—–]/.test(s), s).toBe(false)
  })
})

describe('coverage dates do not drift by a timezone', () => {
  it('renders the day the source reported, not the day before it', () => {
    const ds: BrandDataset = {
      ...pulled(90),
      source: {
        kind: 'aggregator', provider: 'summer', service: 'google_search_console',
        query: 'gsc-queries:90d', syncedAt: Date.parse('2026-07-26T00:00:00Z'),
        coverage: { from: '2026-04-28', to: '2026-07-25' },
      },
    }
    // A date-only string parsed as UTC midnight renders as the 24th west of Greenwich, which had the
    // card claiming a window that ended a day earlier than the warehouse said.
    expect(datasetProvenance(ds, Date.parse('2026-07-26T00:00:00Z')).periodLabel).toContain('25')
  })
})
