import { describe, expect, it } from 'vitest'
import { citableFigures, datasetProvenance, periodOf, pullId, windowDays } from '../datasetRead'
import type { BrandDataset } from '../brandDataset'

/**
 * The arithmetic that decides what a number is worth.
 *
 * Every case here is a rule that, if it broke, would put an unearned figure into published copy. The
 * point is not coverage, it is that each refusal has a test standing behind it.
 */

const SYNCED = Date.parse('2026-03-14T00:00:00Z')

/** A truncated copy of the fixture, built rather than spread (DatasetSource is a union). */
const truncated = (): BrandDataset =>
  pulled({
    source: { kind: 'aggregator', provider: 'summer', service: 'google_search_console', query: 'gsc-queries:90d', syncedAt: SYNCED, truncated: true },
  })

const pulled = (over: Partial<BrandDataset> = {}): BrandDataset => ({
  id: 'ds_1',
  brand: 'Acme',
  name: 'Search queries',
  columns: ['Query', 'Clicks', 'Impressions', 'CTR %', 'Avg position'],
  rows: [
    ['marine survey', '1240', '9000', '13.8', '3.2'],
    ['hull survey', '600', '5000', '12.0', '4.1'],
    ['boat check', '160', '2000', '8.0', '7.5'],
  ],
  source: { kind: 'aggregator', provider: 'summer', service: 'google_search_console', query: 'gsc-queries:90d', syncedAt: SYNCED },
  ...over,
})

describe('windowDays / pullId / periodOf', () => {
  it('parses the stored query', () => {
    expect(windowDays('gsc-pages:90d')).toBe(90)
    expect(pullId('gsc-pages:90d')).toBe('gsc-pages')
    expect(windowDays(undefined)).toBeUndefined()
  })

  it('anchors the period to the pull, not to now', () => {
    // Read a year later: the period must still end on the day it was fetched.
    const later = Date.parse('2027-01-01T00:00:00Z')
    const p = periodOf(pulled())
    expect(p).toContain('90 days to')
    expect(p).toContain('2026')
    expect(datasetProvenance(pulled(), later).periodLabel).toBe(p)
  })
})

describe('datasetProvenance', () => {
  it('a clean pull is measured and citable', () => {
    const p = datasetProvenance(pulled())
    expect(p.tier).toBe('measured')
    expect(p.citable).toBe(true)
    expect(p.badge).toContain('Search Console')
  })

  it('an edited pull is edited and not citable', () => {
    const p = datasetProvenance(pulled({ editedAt: SYNCED + 1000, editedCells: 3 }))
    expect(p.tier).toBe('edited')
    expect(p.citable).toBe(false)
    expect(p.detail).toContain('3 cells changed')
  })

  it('a set with no edit stamp still reads as measured', () => {
    // The guarantee is forward-only: sets edited before the stamp existed cannot be recovered, and
    // marking every old set as suspect would be its own false claim.
    expect(datasetProvenance(pulled()).tier).toBe('measured')
  })

  it('sketched beats everything, including an edit', () => {
    const sketch = pulled({
      source: { kind: 'composite', prompt: 'open rate by segment', generatedAt: SYNCED },
      editedAt: SYNCED + 5,
      editedCells: 1,
    })
    expect(datasetProvenance(sketch).tier).toBe('sketched')
    expect(datasetProvenance(sketch).citable).toBe(false)
  })

  it('an upload is citable, a hand-typed sheet is not', () => {
    const up = pulled({ source: { kind: 'upload', filename: 'queries.csv', importedAt: SYNCED, rowCount: 3 } })
    expect(datasetProvenance(up).citable).toBe(true)
    const typed = pulled({ source: undefined })
    expect(datasetProvenance(typed).tier).toBe('typed')
    expect(datasetProvenance(typed).citable).toBe(false)
  })

  it('reports truncation', () => {
    const t = truncated()
    expect(datasetProvenance(t).partial).toBe(true)
    expect(datasetProvenance(t).detail).toContain('Top 500 rows')
  })
})

describe('citableFigures', () => {
  it('a composite set yields nothing', () => {
    const sketch = pulled({ source: { kind: 'composite', prompt: 'x', generatedAt: SYNCED } })
    expect(citableFigures(sketch)).toEqual([])
  })

  it('an edited set yields nothing', () => {
    expect(citableFigures(pulled({ editedAt: SYNCED + 1, editedCells: 1 }))).toEqual([])
  })

  it('a typed set yields nothing', () => {
    expect(citableFigures(pulled({ source: undefined }))).toEqual([])
  })

  it('every value is reproducible from exactly one cell, or is a documented formatting of one', () => {
    const ds = pulled()
    const cells = new Set(ds.rows.flat().map((c) => c.trim()))
    for (const f of citableFigures(ds)) {
      const bare = f.value.replace(/,/g, '').replace(/%$/, '')
      const fromCell = cells.has(bare)
      const computed = f.basis === 'sum' || f.basis === 'share'
      expect(fromCell || computed).toBe(true)
    }
  })

  it('a truncated pull emits no sum and no share, but still emits a cell', () => {
    const t = truncated()
    const figs = citableFigures(t)
    expect(figs.some((f) => f.basis === 'sum' || f.basis === 'share')).toBe(false)
    expect(figs.some((f) => f.basis === 'cell')).toBe(true)
  })

  it('a rank label names its population, so a capped leader cannot read as the leader', () => {
    const t = truncated()
    const rank = citableFigures(t).find((f) => f.basis === 'rank')
    expect(rank).toBeDefined()
    expect(rank?.label).toContain('rows we fetched')
  })

  it('an untruncated pull totals and shares correctly', () => {
    const figs = citableFigures(pulled())
    const total = figs.find((f) => f.basis === 'sum')
    // 1240 + 600 + 160
    expect(total?.value).toBe('2,000')
    const share = figs.find((f) => f.basis === 'share')
    expect(share?.value).toBe('62%')
  })

  it('an upload carries no period, because the app does not know what it covers', () => {
    const up = pulled({
      source: { kind: 'upload', filename: 'queries.csv', importedAt: SYNCED, rowCount: 3 },
      columns: ['Page', 'Visits'],
      rows: [['/a', '90'], ['/b', '40']],
    })
    const figs = citableFigures(up)
    expect(figs.length).toBeGreaterThan(0)
    for (const f of figs) expect(f.period).toBeUndefined()
  })

  it('caps what one set can contribute', () => {
    const wide = pulled({
      columns: ['Query', 'Clicks', 'Impressions'],
      rows: Array.from({ length: 200 }, (_, i) => [`q${i}`, String(i), String(i * 2)]),
    })
    expect(citableFigures(wide).length).toBeLessThanOrEqual(8)
  })

  it('ids survive a re-pull, so they key off the row rather than its position', () => {
    const a = citableFigures(pulled())
    const reordered = pulled({
      rows: [
        ['hull survey', '600', '5000', '12.0', '4.1'],
        ['marine survey', '1240', '9000', '13.8', '3.2'],
        ['boat check', '160', '2000', '8.0', '7.5'],
      ],
    })
    const b = citableFigures(reordered)
    expect(b.find((f) => f.basis === 'cell')?.id).toBe(a.find((f) => f.basis === 'cell')?.id)
  })

  it('an empty table yields nothing rather than a zero', () => {
    expect(citableFigures(pulled({ rows: [['', '', '', '', '']] }))).toEqual([])
  })
})
