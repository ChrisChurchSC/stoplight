import { describe, it } from 'vitest'
import { citableFigures, readDataset, figuresUsedIn, type CitableFigure } from '../datasetRead'
import { reachesOutput, resolveBoardDirection } from '../boardResolve'
import type { BrandDataset } from '../brandDataset'
import type { CanvasObject, FlowBoard } from '../flowBoard'

/** THROWAWAY. Isolates the repeated column scans in sniffShape, and sums a render pass. */

const SYNCED = Date.parse('2026-07-25T00:00:00Z')
const NOW = SYNCED + 2 * 86_400_000

function time(label: string, iters: number, fn: () => unknown): number {
  fn()
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) fn()
  const ms = (performance.now() - t0) / iters
  // eslint-disable-next-line no-console
  console.log(`${label.padEnd(58)} ${ms.toFixed(4)} ms/call  (x${iters})`)
  return ms
}

const rowsOf = (n: number): string[][] =>
  Array.from({ length: n }, (_, i) => [
    `page /guides/${i}/marine-survey-checklist`,
    String(2000 - i * 3),
    String(40000 - i * 60),
    (13.8 - (i % 90) / 10).toFixed(1),
    (3.2 + (i % 40) / 10).toFixed(1),
  ])

const upload = (n: number, cols = 5): BrandDataset => ({
  id: 'ds_up',
  brand: 'Acme',
  name: 'Export',
  columns: ['Page', 'Clicks', 'Impressions', 'CTR %', 'Avg position'].slice(0, cols),
  rows: rowsOf(n).map((r) => r.slice(0, cols)),
  source: { kind: 'upload', filename: 'export.csv', importedAt: SYNCED, rowCount: n },
})

// ---- the two things sniffShape does repeatedly, counted -------------------------

const numOf = (v: string): number | null => {
  const t = (v ?? '').trim().replace(/,/g, '').replace(/%$/, '')
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

/** Exactly the passes sniffShape makes today, instrumented. */
function countPasses(cols: string[], rows: string[][]): { cellReads: number } {
  let cellReads = 0
  const numericShare = (i: number): number => {
    cellReads += rows.length
    return rows.filter((r) => numOf(r[i] ?? '') !== null).length / rows.length
  }
  const magnitude = (i: number): number => {
    cellReads += rows.length
    return rows.reduce((n, r) => n + (numOf(r[i] ?? '') ?? 0), 0)
  }
  const dim = cols.findIndex((_, i) => numericShare(i) < 0.2)
  const numericCols = cols.map((_, i) => i).filter((i) => i !== dim && numericShare(i) > 0.8)
  const looksRate = (i: number): boolean => /%|rate|ctr/i.test(cols[i] ?? '')
  const isCount = (i: number): boolean => {
    cellReads += rows.length
    const nums = rows.map((r) => numOf(r[i] ?? '')).filter((n): n is number => n !== null)
    if (!nums.length) return false
    const whole = nums.filter((n) => Number.isInteger(n)).length / nums.length
    return whole > 0.8 && !/avg|average|position|rank|per\b/i.test(cols[i] ?? '')
  }
  const counts = numericCols.filter((i) => !looksRate(i) && isCount(i))
  const rateCol = numericCols.find((i) => looksRate(i))
  const bySize = [...counts].sort((a, b) => magnitude(a) - magnitude(b))
  const primary = rateCol !== undefined && counts.length >= 2 ? bySize[0] : bySize[bySize.length - 1]
  const denom = rateCol !== undefined && counts.length >= 2 ? bySize[bySize.length - 1] : null
  if (rateCol !== undefined && denom !== null && denom !== primary) {
    magnitude(denom)
    magnitude(primary)
  }
  return { cellReads }
}

describe('sniffShape redundant scans', () => {
  it('counts cell reads and times the memoised alternative', () => {
    for (const n of [500]) {
      const ds = upload(n)
      const rows = ds.rows
      const { cellReads } = countPasses(ds.columns, rows)
      // eslint-disable-next-line no-console
      console.log(`sniffShape cell reads over ${n} rows x ${ds.columns.length} cols: ${cellReads} (table has ${n * ds.columns.length} cells)`)

      // The same answer from ONE pass: numeric count, integer count and sum per column together.
      const oneShot = () => {
        const c = ds.columns.length
        const numeric = new Array(c).fill(0)
        const whole = new Array(c).fill(0)
        const sum = new Array(c).fill(0)
        for (const r of rows) {
          for (let i = 0; i < c; i++) {
            const v = numOf(r[i] ?? '')
            if (v === null) continue
            numeric[i]++
            sum[i] += v
            if (Number.isInteger(v)) whole[i]++
          }
        }
        return { numeric, whole, sum }
      }
      time(`one-pass column stats            ${n} rows`, 500, oneShot)
      time(`countPasses (today's passes)     ${n} rows`, 500, () => countPasses(ds.columns, rows))
      time(`readDataset whole call           ${n} rows`, 500, () => readDataset(ds, NOW))
    }
  })
})

// ---- what one FlowsView render pass costs while the copy inspector is open ------

function board(cards: number): FlowBoard {
  const objects: CanvasObject[] = Array.from({ length: cards }, (_, i) => ({
    id: `o${i}`,
    kind: (['audience', 'proof-point', 'product', 'note'] as const)[i % 4] as CanvasObject['kind'],
    text: `Card ${i}`,
    refId: `rec_${i}`,
    direction: [{ key: 'tone', value: `tone ${i}` }],
  }))
  const connectors: { from: string; to: string }[] = []
  for (let i = 0; i < cards; i++) {
    if (i % 3 === 0) connectors.push({ from: `o${i}`, to: 'campaign' })
    else connectors.push({ from: `o${i}`, to: `o${Math.max(0, i - 1)}` })
    if (i % 4 === 0) connectors.push({ from: `o${i}`, to: `linkedin|post${i % 6}` })
  }
  return { key: 'C', objects, placements: [], pos: {}, connectors }
}

describe('one FlowsView render pass, copy inspector open', () => {
  it('sums the unmemoised domain work', () => {
    const b = board(30)
    for (const setCount of [1, 4, 12]) {
      const sets = Array.from({ length: setCount }, (_, i) => ({ ...upload(500), id: `ds_${i}` }))
      const figs: CitableFigure[] = sets.flatMap((d) => citableFigures(d, NOW))
      const texts = ['Cut survey time by 13.8%. 1,240 clicks last quarter.', 'Book a call']
      time(`render pass: ${String(setCount).padStart(2)} x 500-row set + 30-card board`, 100, () => {
        // FlowsView.tsx:8060 — citableFigures over every brand data set, unmemoised.
        const all = sets.flatMap((d) => citableFigures(d, NOW).map((f) => ({ f, d })))
        // FlowsView.tsx:7998 — resolveBoardDirection, unmemoised.
        const resolved = resolveBoardDirection(b)
        // FlowsView.tsx:7330 + 7481 — informsOutput per visible card.
        const attached = b.objects.map((o) => reachesOutput(b, o.id))
        return [all.length, resolved.byTarget.size, attached.length]
      })
      time(`  figuresUsedIn over ${String(figs.length).padStart(3)} figures`, 2000, () => figuresUsedIn(texts, figs))
    }
  })
})
