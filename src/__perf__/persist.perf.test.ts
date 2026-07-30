/* THROWAWAY perf probe. Delete after review. */
import { describe, it } from 'vitest'

// ---- localStorage shim (node env, no jsdom) ----
class LS {
  map = new Map<string, string>()
  reads = 0
  writes = 0
  bytesWritten = 0
  getItem(k: string) { this.reads++; return this.map.has(k) ? this.map.get(k)! : null }
  setItem(k: string, v: string) { this.writes++; this.bytesWritten += v.length; this.map.set(k, v) }
  removeItem(k: string) { this.map.delete(k) }
  key() { return null }
  clear() { this.map.clear() }
  get length() { return this.map.size }
}
const ls = new LS()
;(globalThis as unknown as { localStorage: LS }).localStorage = ls

const { MockSheetAdapter } = await import('../adapters/sheet/mockSheetAdapter')
const { sampleRows } = await import('../domain/sampleData')

type Row = ReturnType<typeof sampleRows>[number]

// A REALISTIC generated row: full messaging set, rtbMap, lineage, flags.
function fatRow(i: number): Row {
  const base = sampleRows(Date.now())[i % 16]
  return {
    ...base,
    id: `row_${i}`,
    assetId: `asset_${i}`,
    assetName: `Q3 launch asset ${i} — carousel slide`,
    messaging: {
      headline: 'The reef guide that captains actually keep on the boat',
      primaryText:
        'Every wreck within forty miles, tide-corrected, with the approach notes we only used to give to charter clients. Built from 12 years of logbooks and checked against NOAA charts every season. Free for the first 500 captains.',
      description: 'Tide-corrected wreck charts, updated every season.',
      cta: 'Download the guide',
      caption: 'Save this one for the next slow tide. #reeffishing #wreckfishing',
      altText: 'A chart overlay showing 40 miles of wreck sites off the Jersey coast',
      linkPreview: 'Reef & Wreck Guide 2026',
    },
    rtbMap: { headline: ['rtb_logbooks'], primaryText: ['rtb_logbooks', 'rtb_noaa', 'rtb_500'], description: ['rtb_noaa'] },
    figuresUsed: ['fig_40mi', 'fig_12yr', 'fig_500'],
    fanFrom: { audience: 'Captains', location: 'Asbury', journey: 'Convert' },
    copySource: 'claude',
    copyAt: Date.now(),
    flightId: 'flight_q3_2026',
    client: 'Reef & Wreck',
    campaign: 'Q3 Guide Launch',
    audience: 'Captains',
  } as Row
}

function bytes(n: number) { return `${(n / 1024).toFixed(1)} kB` }

describe('persistence cost', () => {
  it('row payload size', () => {
    const lean = sampleRows(Date.now())
    const leanBytes = JSON.stringify({ rows: lean }).length
    console.log(`\n== ROW SIZE ==`)
    console.log(`sample (seed) row avg: ${(leanBytes / lean.length).toFixed(0)} B`)
    const fat = Array.from({ length: 100 }, (_, i) => fatRow(i))
    const fatBytes = JSON.stringify({ rows: fat }).length
    console.log(`realistic generated row avg: ${(fatBytes / fat.length).toFixed(0)} B`)
    for (const n of [50, 200, 500, 1000, 2000]) {
      console.log(`  sheet with ${n} realistic rows: ${bytes((fatBytes / fat.length) * n)}`)
    }
  })

  it('MockSheetAdapter.update + list cost per call', async () => {
    console.log(`\n== updateRow COST (mock / localStorage path) ==`)
    for (const n of [50, 200, 500, 1000, 2000]) {
      const rows = Array.from({ length: n }, (_, i) => fatRow(i))
      ls.clear()
      const a = new MockSheetAdapter()
      await a.replaceAll(rows)
      const payload = ls.map.get('stoplight.sheet.v1')!.length
      // warm
      for (let i = 0; i < 5; i++) { await a.update('row_10', { messaging: { headline: 'x' } }); await a.list() }
      ls.reads = 0; ls.writes = 0; ls.bytesWritten = 0
      const ITER = 60
      const t0 = performance.now()
      for (let i = 0; i < ITER; i++) {
        // exactly what updateRow does: sheet.update then refresh -> sheet.list
        await a.update('row_10', { messaging: { headline: `typing ${i}` } })
        await a.list()
      }
      const t1 = performance.now()
      console.log(
        `n=${String(n).padStart(4)}  sheet=${bytes(payload).padStart(9)}  ` +
        `per keystroke: ${((t1 - t0) / ITER).toFixed(2)} ms, ` +
        `${(ls.bytesWritten / ITER / 1024).toFixed(0)} kB serialized, ` +
        `${ls.reads / ITER} LS reads + ${ls.writes / ITER} LS write`,
      )
    }
  })

  it('refresh() normalization loop cost', async () => {
    console.log(`\n== refresh() raw.find() loop (store line 5467) ==`)
    for (const n of [50, 200, 500, 1000, 2000]) {
      const raw = Array.from({ length: n }, (_, i) => fatRow(i))
      const rows = raw.map((r) => r)
      const t0 = performance.now()
      const ITER = 30
      for (let k = 0; k < ITER; k++) {
        for (const r of rows) {
          const orig = raw.find((o) => o.id === r.id)
          if (orig && orig.channel !== r.channel) { /* noop */ }
        }
      }
      const t1 = performance.now()
      console.log(`n=${String(n).padStart(4)}  ${((t1 - t0) / ITER).toFixed(2)} ms per refresh (${n * n} comparisons worst case)`)
    }
  })
})
