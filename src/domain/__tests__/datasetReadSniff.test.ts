import { describe, expect, it } from 'vitest'
import { readDataset } from '../datasetRead'
import type { BrandDataset } from '../brandDataset'

/**
 * A PASTED EXPORT READS LIKE A PULLED ONE.
 *
 * Until a connector is configured, paste is the only route available, and it was getting a headline
 * and nothing else while the identical data through a connector got findings. Concentration and rate
 * outliers are comparisons inside the table, so they hold whatever period the file covers. What the
 * table cannot know is still refused, and still said out loud.
 */

const IMPORTED = Date.parse('2026-03-14T00:00:00Z')

/** A realistic Search Console export: a few winners and a long tail. */
const pastedGsc = (): BrandDataset => {
  const top: (string | number)[][] = [
    ['acme crm', 820, 6100, 13.4, 3.1],
    ['acme pricing', 410, 3200, 12.8, 2.4],
    ['acme vs hubspot', 260, 4800, 5.4, 6.2],
    ['crm for agencies', 180, 5200, 3.5, 8.1],
    ['acme reviews', 150, 1900, 7.9, 4.4],
    ['simple crm', 95, 7400, 1.3, 14.2],
    ['acme login', 88, 700, 12.6, 1.8],
    ['best crm small team', 72, 6900, 1.0, 18.4],
    ['acme integrations', 61, 1500, 4.1, 7.7],
    ['acme demo', 54, 900, 6.0, 3.3],
  ]
  const tail = Array.from({ length: 18 }, (_, i) => [`crm long tail ${i + 1}`, Math.max(1, 14 - i), 900 - i * 30, 1.4, 20 + i])
  return {
    id: 'ds_p',
    brand: 'Acme',
    name: 'Pasted table',
    columns: ['Query', 'Clicks', 'Impressions', 'CTR %', 'Avg position'],
    rows: [...top, ...tail].map((r) => r.map(String)),
    source: { kind: 'upload', filename: 'Pasted', importedAt: IMPORTED, rowCount: 28 },
  }
}

describe('a pasted export', () => {
  it('gets a real reading, not just a headline', () => {
    const read = readDataset(pastedGsc())
    expect(read.ok).toBe(true)
    expect(read.headline).toContain('clicks')
    expect(read.findings.length).toBeGreaterThan(0)
  })

  it('finds the concentration, because that is a fact about the rows in front of it', () => {
    const read = readDataset(pastedGsc())
    const conc = read.findings.find((f) => f.id.endsWith('concentration'))
    expect(conc).toBeDefined()
    expect(conc?.claim).toContain('%')
    expect(conc?.detail).toContain('Clicks')
  })

  it('picks Impressions as the rate denominator, not Clicks', () => {
    const read = readDataset(pastedGsc())
    const rate = read.findings.find((f) => f.id.endsWith('rate-low'))
    if (rate) {
      expect(rate.detail).toContain('CTR %')
      expect(rate.detail).toContain('Impressions')
    }
  })

  it('still says it does not know what period the file covers', () => {
    const read = readDataset(pastedGsc())
    expect(read.caveats.join(' ')).toContain('do not know what period')
    expect(read.caveats.join(' ')).toContain('worked out from the table itself')
  })

  it('still refuses a trend', () => {
    const read = readDataset(pastedGsc())
    const all = [read.read ?? '', ...read.findings.map((f) => f.claim)].join(' ').toLowerCase()
    for (const w of ['rising', 'falling', 'trend', 'declin', 'growth']) expect(all).not.toContain(w)
  })

  it('reads nothing from a table with no numbers', () => {
    const words: BrandDataset = {
      id: 'ds_w', brand: 'Acme', name: 'Notes',
      columns: ['Idea', 'Owner'],
      rows: [['launch video', 'sam'], ['case study', 'ali'], ['webinar', 'jo']],
      source: { kind: 'upload', filename: 'Pasted', importedAt: IMPORTED, rowCount: 3 },
    }
    const read = readDataset(words)
    expect(read.ok).toBe(false)
    expect(read.findings).toEqual([])
  })

  it('will not invent a rate when no column looks like one', () => {
    const plain: BrandDataset = {
      id: 'ds_pl', brand: 'Acme', name: 'Pasted table',
      columns: ['Page', 'Visits'],
      rows: Array.from({ length: 25 }, (_, i) => [`/p${i}`, String(500 - i * 15)]),
      source: { kind: 'upload', filename: 'Pasted', importedAt: IMPORTED, rowCount: 25 },
    }
    const read = readDataset(plain)
    expect(read.findings.some((f) => f.id.endsWith('rate-low'))).toBe(false)
    expect(read.findings.some((f) => f.id.endsWith('concentration'))).toBe(true)
  })
})
