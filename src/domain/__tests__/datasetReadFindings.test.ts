import { describe, expect, it } from 'vitest'
import { FLOORS, readDataset } from '../datasetRead'
import type { BrandDataset } from '../brandDataset'

/**
 * The refusals. Each of these is a sentence the app could confidently say and would be wrong to.
 */

const SYNCED = Date.parse('2026-03-14T00:00:00Z')

const gsc = (rows: string[][], over: Partial<BrandDataset> = {}): BrandDataset => ({
  id: 'ds_r',
  brand: 'Acme',
  name: 'Search queries',
  columns: ['Query', 'Clicks', 'Impressions', 'CTR %', 'Avg position'],
  rows,
  source: { kind: 'aggregator', provider: 'summer', service: 'google_search_console', query: 'gsc-queries:90d', syncedAt: SYNCED },
  ...over,
})

/** Twelve honest rows: enough for concentration, all above the rate floor. */
const solid = Array.from({ length: 24 }, (_, i) => [
  `q${i}`,
  String(120 - i * 8),
  String(2000 - i * 100),
  String(Math.round((((120 - i * 8) / (2000 - i * 100)) * 100) * 10) / 10),
  '4.0',
])

describe('readDataset refusals', () => {
  it('a 3-impression row at 33% never becomes a rate finding', () => {
    // The classic false insight: one click on three impressions is not a star performer.
    const ds = gsc([...solid, ['tiny', '1', '3', '33.3', '9.0']])
    const read = readDataset(ds)
    for (const f of read.findings) expect(f.claim).not.toContain('tiny')
  })

  it('a truncated table produces no concentration finding and no total headline', () => {
    const ds = gsc(solid, {
      source: { kind: 'aggregator', provider: 'summer', service: 'google_search_console', query: 'gsc-queries:90d', syncedAt: SYNCED, truncated: true },
    })
    const read = readDataset(ds)
    expect(read.findings.some((f) => f.id.endsWith('concentration'))).toBe(false)
    expect(read.headline).toContain('in the top')
    expect(read.caveats.join(' ')).toContain('top 500 rows')
  })

  it('an untruncated table does produce a concentration finding', () => {
    const read = readDataset(gsc(solid))
    expect(read.findings.some((f) => f.id.endsWith('concentration'))).toBe(true)
  })

  it('fewer than ten rows is not a concentration', () => {
    const read = readDataset(gsc(solid.slice(0, 6)))
    expect(read.findings.some((f) => f.id.endsWith('concentration'))).toBe(false)
  })

  it('exactly ten rows is not a concentration either, because the top ten is all of them', () => {
    // "The top 10 are 100% of them" is arithmetic wearing the clothes of a finding.
    const read = readDataset(gsc(solid.slice(0, 10)))
    expect(read.findings.some((f) => f.id.endsWith('concentration'))).toBe(false)
    expect((read.read ?? '') + read.findings.map((f) => f.claim).join(' ')).not.toContain('100%')
  })

  it('pluralises the dimension properly', () => {
    const read = readDataset(gsc(solid))
    const all = (read.read ?? '') + read.findings.map((f) => f.claim).join(' ')
    expect(all).not.toContain('querys')
    if (all.includes('quer')) expect(all).toContain('queries')
  })

  it('a sketched table returns nothing readable, not even a headline', () => {
    const ds = gsc(solid, { source: { kind: 'composite', prompt: 'x', generatedAt: SYNCED } })
    const read = readDataset(ds)
    expect(read.ok).toBe(false)
    expect(read.findings).toEqual([])
    expect(read.headline).toBeUndefined()
    expect(read.caveats).toHaveLength(1)
  })

  it('an upload gets a headline and zero findings, because we do not know what it covers', () => {
    const up: BrandDataset = {
      id: 'ds_u', brand: 'Acme', name: 'Pasted table',
      columns: ['Page', 'Visits'],
      rows: [['/a', '90'], ['/b', '40'], ['/c', '10']],
      source: { kind: 'upload', filename: 'x.csv', importedAt: SYNCED, rowCount: 3 },
    }
    const read = readDataset(up)
    expect(read.ok).toBe(true)
    expect(read.headline).toBe('140 visits')
    expect(read.findings).toEqual([])
    expect(read.caveats.join(' ')).toContain('do not know what period')
  })

  it('never claims a trend from one pull', () => {
    const read = readDataset(gsc(solid))
    const all = [read.read ?? '', ...read.findings.map((f) => f.claim)].join(' ').toLowerCase()
    for (const word of ['up ', 'down ', 'rising', 'falling', 'growth', 'declin', 'trend', 'since last']) {
      expect(all, word).not.toContain(word)
    }
    expect(read.caveats.join(' ')).toContain('one snapshot')
  })

  it("every number in a claim is also one of that finding own figures", () => {
    const read = readDataset(gsc(solid))
    expect(read.findings.length).toBeGreaterThan(0)
    for (const f of read.findings) {
      const claimNums = (f.claim.match(/\d[\d,]*(\.\d+)?%?/g) ?? []).map((x) => x.replace(/,/g, ''))
      const figureNums = new Set(f.figures.map((x) => x.value.replace(/,/g, '')))
      for (const n of claimNums) expect(figureNums.has(n), `${n} in "${f.claim}"`).toBe(true)
    }
  })

  it('no caveat or claim carries a dash the house style forbids', () => {
    const read = readDataset(gsc(solid))
    for (const s of [...read.caveats, ...read.findings.map((f) => f.claim), ...read.findings.map((f) => f.detail), read.read ?? '']) {
      expect(/[—–]/.test(s), s).toBe(false)
    }
  })

  it('reads a 500 by 6 table well inside a render frame', () => {
    const big = Array.from({ length: 500 }, (_, i) => [`q${i}`, String(500 - i), String(5000 - i * 5), '2.0', '4.0'])
    const t0 = performance.now()
    readDataset(gsc(big))
    expect(performance.now() - t0).toBeLessThan(20)
  })

  it('exposes its floors, so they can be argued with', () => {
    expect(FLOORS.rateDenominator).toBeGreaterThanOrEqual(50)
    expect(FLOORS.concentrationRows).toBeGreaterThanOrEqual(10)
  })
})
