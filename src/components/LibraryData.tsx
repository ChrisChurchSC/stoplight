import { useMemo } from 'react'
import { computeDataUnlocks } from '../domain/dataUnlocks'
import type { TrafficRow } from '../domain/types'
import {
  FindingsCharts,
  FindingsTable,
  KpiBand,
  ReachSubsScatter,
  PostingByWeekday,
  ReachMixOverTime,
} from './FindingsCharts'
import { LibraryMap } from './LibraryMap'

/**
 * Insights — the straight read on the Library: a visual header (headline metrics, reach
 * charts, and the content-flow map) over a spreadsheet of every finding that actually
 * computes off this brand's data. Nothing locked or teased: if there isn't enough data
 * to say something yet, it simply isn't here.
 */

/**
 * When this brand's findings were last refreshed from real data. Prefers the freshest
 * `metricsUpdatedAt` (an actual metrics pull) and only falls back to publish/add times
 * for brands that have no metrics yet — so the chip never claims a sync that didn't
 * happen. Freshness tone: green < 7d, amber < 30d, red beyond.
 */
type Synced = { abs: string; rel: string; tone: 'good' | 'warn' | 'bad'; title: string }

function lastSynced(items: TrafficRow[]): Synced | null {
  const maxOf = (f: (r: TrafficRow) => number | undefined) =>
    items.reduce((m, r) => Math.max(m, f(r) ?? 0), 0)
  let ts = maxOf((r) => r.metricsUpdatedAt)
  let basis = 'Performance metrics last pulled'
  if (!ts) {
    ts = maxOf((r) => r.postedAt)
    basis = 'Most recent published content'
  }
  if (!ts) {
    ts = maxOf((r) => r.createdAt)
    basis = 'Most recent content added'
  }
  if (!ts) return null
  const d = new Date(ts)
  const abs = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  const rel =
    days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : days < 60 ? 'last month' : `${Math.floor(days / 30)} months ago`
  const tone = days < 7 ? 'good' : days < 30 ? 'warn' : 'bad'
  const title = `${basis} on ${d.toLocaleString()}. Findings recompute from this brand's library each time this page loads.`
  return { abs, rel, tone, title }
}

export function LibraryData({
  items,
  allRows,
  proofPoints = [],
  ctas = [],
  audiences = [],
  sources = [],
  donorLinked = false,
}: {
  items: TrafficRow[]
  allRows: TrafficRow[]
  proofPoints?: { label?: string }[]
  ctas?: { label?: string }[]
  audiences?: { name?: string; label?: string }[]
  sources?: string[]
  donorLinked?: boolean
}) {
  const prog = useMemo(
    () => computeDataUnlocks({ items, allRows, proofPoints, ctas, audiences, sources, donorLinked }),
    [items, allRows, proofPoints, ctas, audiences, sources, donorLinked],
  )

  if (!items.length) {
    return <div className="mtx-empty">Ingest this brand's content first — findings appear as the library grows.</div>
  }

  // Only what actually computed a finding. Locked / not-enough-data insights are simply omitted.
  const groups = prog.byCategory
    .map(({ category, unlocks }) => ({ category, found: unlocks.filter((u) => u.unlocked && u.finding) }))
    .filter((g) => g.found.length > 0)
  const total = groups.reduce((n, g) => n + g.found.length, 0)
  const synced = lastSynced(items)

  if (!total) {
    return (
      <div className="mtx-empty">
        No findings yet. Keep publishing, tag content to audiences, and connect a source, and they appear here on their own.
      </div>
    )
  }

  return (
    <div className="ldata ldata-simple">
      <div className="ldata-head">
        <span className="ldata-head-label">
          Findings <span className="ldata-head-count">{total}</span>
        </span>
        {synced && (
          <span className={`ldata-synced t-${synced.tone}`} title={synced.title}>
            <span className="ldata-synced-dot" aria-hidden="true" />
            Synced {synced.abs}
            <span className="ldata-synced-rel"> · {synced.rel}</span>
          </span>
        )}
      </div>

      <KpiBand items={items} />
      <FindingsCharts items={items} />
      <div className="fchart-row">
        <ReachSubsScatter items={items} />
        <PostingByWeekday items={items} />
      </div>
      <ReachMixOverTime items={items} />

      <section className="lfind-mapcard">
        <LibraryMap rows={items} />
      </section>

      <FindingsTable groups={groups} />
    </div>
  )
}
