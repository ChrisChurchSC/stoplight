import { describe, it } from 'vitest'
import { citableFigures, datasetProvenance, readDataset } from '../datasetRead'
import { detectStructuralBreaks, normalizeFigure, type CoherenceVocab } from '../coherenceChecks'
import { downstreamTargets, reachesOutput, resolveBoardDirection, wiredRefsFor } from '../boardResolve'
import { parseTable } from '../../lib/parseTable'
import { messagingFields, messagingSummary } from '../messaging'
import type { BrandDataset } from '../brandDataset'
import type { FlowBoard, CanvasObject } from '../flowBoard'
import type { TrafficRow, ChannelId } from '../types'

/**
 * THROWAWAY BENCHMARK. Not an assertion suite: it prints milliseconds.
 * Delete after the review.
 */

const SYNCED = Date.parse('2026-07-25T00:00:00Z')
const NOW = SYNCED + 2 * 86_400_000

function time(label: string, iters: number, fn: () => unknown): number {
  fn() // warm
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) fn()
  const ms = (performance.now() - t0) / iters
  // eslint-disable-next-line no-console
  console.log(`${label.padEnd(56)} ${ms.toFixed(4)} ms/call  (x${iters})`)
  return ms
}

// ---------------------------------------------------------------- datasets

const gscRows = (n: number): string[][] =>
  Array.from({ length: n }, (_, i) => [
    `search query number ${i} for marine survey`,
    String(2000 - i * 3),
    String(40000 - i * 60),
    (13.8 - (i % 90) / 10).toFixed(1),
    (3.2 + (i % 40) / 10).toFixed(1),
  ])

const gsc = (n: number, over: Partial<BrandDataset> = {}): BrandDataset => ({
  id: 'ds_gsc',
  brand: 'Acme',
  name: 'Search queries',
  columns: ['Query', 'Clicks', 'Impressions', 'CTR %', 'Avg position'],
  rows: gscRows(n),
  source: {
    kind: 'aggregator',
    provider: 'summer',
    service: 'google_search_console',
    query: 'gsc-queries:90d',
    syncedAt: SYNCED,
    coverage: { from: '2026-04-26', to: '2026-07-24' },
  },
  ...over,
})

/** Same 500 rows, arriving as an upload, so READ_SHAPE misses and sniffShape has to run. */
const uploaded = (n: number): BrandDataset => ({
  id: 'ds_up',
  brand: 'Acme',
  name: 'Export',
  columns: ['Page', 'Clicks', 'Impressions', 'CTR %', 'Avg position'],
  rows: gscRows(n),
  source: { kind: 'upload', filename: 'export.csv', importedAt: SYNCED, rowCount: n },
})

describe('datasetRead', () => {
  it('times readDataset and citableFigures', () => {
    for (const n of [50, 500]) {
      time(`readDataset  declared pull   ${n} rows`, 200, () => readDataset(gsc(n), NOW))
      time(`readDataset  sniffed upload  ${n} rows`, 200, () => readDataset(uploaded(n), NOW))
      time(`citableFigures declared      ${n} rows`, 200, () => citableFigures(gsc(n), NOW))
      time(`citableFigures upload sniff  ${n} rows`, 200, () => citableFigures(uploaded(n), NOW))
      time(`datasetProvenance            ${n} rows`, 2000, () => datasetProvenance(gsc(n), NOW))
    }
    // What a card render actually costs when a brand has several tables wired.
    const many = Array.from({ length: 12 }, (_, i) => ({ ...uploaded(500), id: `ds_${i}` }))
    time('12 uploaded 500-row sets: citableFigures each', 20, () => many.flatMap((d) => citableFigures(d, NOW)))
  })
})

// ---------------------------------------------------------------- coherence

const WORDS = 'harbour survey vessel inspection compliance registry marina skipper charter mooring insurance broker valuation hull rigging engine warranty inspection schedule coastal offshore'.split(' ')
const copyLine = (i: number): string =>
  `Cut ${WORDS[i % WORDS.length]} time by ${(i % 40) + 3}%. Our ${WORDS[(i + 3) % WORDS.length]} desk handles the ${WORDS[(i + 7) % WORDS.length]} paperwork so your ${WORDS[(i + 11) % WORDS.length]} team does not. Book a call.`

const asset = (i: number): TrafficRow =>
  ({
    id: `r${i}`,
    campaign: 'C',
    assetName: `Asset ${i}`,
    channel: (['linkedin', 'email', 'website', 'meta'] as const)[i % 4] as ChannelId,
    assetType: 'post',
    audience: i % 2 ? 'Fleet managers' : 'Marina owners',
    branchOf: i > 10 && i % 5 === 0 ? `Asset ${i - 5}` : undefined,
    messaging: {
      headline: `${WORDS[i % WORDS.length]} without the paperwork`,
      primary: copyLine(i),
      cta: 'Book a call',
    },
  }) as unknown as TrafficRow

const vocab = (): CoherenceVocab => {
  const ownTerms = new Set<string>(WORDS.filter((w) => w.length >= 4))
  for (let i = 0; i < 200; i++) ownTerms.add(`ownterm${i}`)
  const foreign = new Map<string, string>()
  for (let i = 0; i < 120; i++) foreign.set(`rivalterm${i}`, `Rival ${i % 6}`)
  const proofById = new Map<string, { label: string; audienceId?: string }>()
  for (let i = 0; i < 30; i++) proofById.set(`rtb_${i}`, { label: `Proof ${i}`, audienceId: i % 2 ? 'Fleet managers' : 'Marina owners' })
  return {
    client: 'Acme',
    campaign: 'C',
    audiences: [
      { name: 'Fleet managers', role: 'operations lead', pains: ['downtime between charters', 'paperwork before every survey', 'unplanned dry dock'], terms: new Set(['operations', 'downtime', 'charters', 'paperwork', 'survey', 'dock']) },
      { name: 'Marina owners', role: 'marina owner', pains: ['berth utilisation', 'insurance renewals', 'transient bookings'], terms: new Set(['marina', 'berth', 'utilisation', 'insurance', 'renewals', 'transient', 'bookings']) },
      { name: 'Brokers', role: 'yacht broker', pains: ['valuation disputes', 'listing quality', 'slow closes'], terms: new Set(['broker', 'valuation', 'disputes', 'listing', 'closes']) },
    ],
    ownTerms,
    foreign,
    proofById,
    sources: [],
    targetAccounts: ['Northline Marine', 'Harbour Group', 'Seaboard Holdings'],
    partners: ['Coastal Ltd'],
    citableValues: new Set(['13.8%', '4.1%', '3x'].map(normalizeFigure)),
    datasetsWired: true,
  } as unknown as CoherenceVocab
}

describe('coherenceChecks', () => {
  it('times detectStructuralBreaks', () => {
    const v = vocab()
    for (const n of [10, 50, 200]) {
      const rows = Array.from({ length: n }, (_, i) => asset(i))
      time(`detectStructuralBreaks  ${n} assets`, 100, () => detectStructuralBreaks(rows, v))
    }
    // Vocab with no other-brand terms: how much of the cost is contamination?
    const noForeign = { ...v, foreign: new Map<string, string>() } as CoherenceVocab
    const rows50 = Array.from({ length: 50 }, (_, i) => asset(i))
    time('detectStructuralBreaks  50 assets, no foreign', 100, () => detectStructuralBreaks(rows50, noForeign))
    const oneAud = { ...v, audiences: v.audiences.slice(0, 1) } as CoherenceVocab
    time('detectStructuralBreaks  50 assets, 1 audience', 100, () => detectStructuralBreaks(rows50, oneAud))
  })
})

// ---------------------------------------------------------------- board

function board(cards: number, wireFanout = 2): FlowBoard {
  const objects: CanvasObject[] = Array.from({ length: cards }, (_, i) => ({
    id: `o${i}`,
    kind: (['audience', 'proof-point', 'product', 'note'] as const)[i % 4] as CanvasObject['kind'],
    text: `Card ${i}`,
    refId: `rec_${i}`,
    direction: [{ key: 'tone', value: `tone ${i}` }],
  }))
  const connectors: { from: string; to: string }[] = []
  // A realistic board: chains of cards feeding the brief and a handful of deliverables.
  for (let i = 0; i < cards; i++) {
    if (i % 3 === 0) connectors.push({ from: `o${i}`, to: 'campaign' })
    else connectors.push({ from: `o${i}`, to: `o${Math.max(0, i - (1 + (i % wireFanout)))}` })
    if (i % 4 === 0) connectors.push({ from: `o${i}`, to: `linkedin|post${i % 6}` })
  }
  return { key: 'C', objects, placements: [], pos: {}, connectors }
}

describe('boardResolve', () => {
  it('times the graph walks', () => {
    for (const n of [10, 30, 100]) {
      const b = board(n)
      time(`resolveBoardDirection            ${n} cards`, 200, () => resolveBoardDirection(b))
      // What ONE render pass of the canvas costs: reachesOutput per card.
      time(`reachesOutput x${String(n).padEnd(3)} (one render)  ${n} cards`, 100, () => b.objects.map((o) => reachesOutput(b, o.id)))
      time(`downstreamTargets one card       ${n} cards`, 500, () => downstreamTargets(b, 'o1'))
      time(`wiredRefsFor 'campaign'          ${n} cards`, 500, () => wiredRefsFor(b, [], 'campaign'))
    }
  })
})

// ---------------------------------------------------------------- parseTable

describe('parseTable', () => {
  it('times CSV parsing', () => {
    const mk = (n: number) =>
      ['Query,Clicks,Impressions,CTR %,Avg position']
        .concat(Array.from({ length: n }, (_, i) => `"marine survey, ${i}",${2000 - i},${40000 - i * 60},13.8,3.2`))
        .join('\n')
    for (const n of [500, 5000, 50000]) {
      const csv = mk(n)
      time(`parseTable ${String(n).padEnd(5)} rows (${(csv.length / 1024).toFixed(0)} KB)`, n > 5000 ? 5 : 50, () => parseTable(csv))
    }
  })
})

// ---------------------------------------------------------------- messaging

describe('messaging', () => {
  it('times messagingFields', () => {
    const rows = Array.from({ length: 200 }, (_, i) => asset(i))
    time('messagingFields x1', 20000, () => messagingFields('linkedin', 'post'))
    time('messagingSummary x200 rows', 2000, () => rows.map((r) => messagingSummary(r)))
  })
})
