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

  if (!total) {
    return (
      <div className="mtx-empty">
        No findings yet. Keep publishing, tag content to audiences, and connect a source, and they appear here on their own.
      </div>
    )
  }

  return (
    <div className="ldata ldata-simple">
      <header className="mtx-head">
        <h2>Findings</h2>
        <span className="mtx-sub">
          {total} {total === 1 ? 'thing' : 'things'} the data can say about this brand right now. They update as the
          library grows.
        </span>
      </header>

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
