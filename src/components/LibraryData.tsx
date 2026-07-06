import { useMemo } from 'react'
import { computeDataUnlocks } from '../domain/dataUnlocks'
import type { TrafficRow } from '../domain/types'
import { FindingsCharts } from './FindingsCharts'

const num = (n: number) => n.toLocaleString()
/** The finding's source: the real ingested-data volumes it was computed over. */
const sourceLine = (sources: { metric: string; current: number }[]): string =>
  sources.map((s) => `${num(s.current)} ${s.metric}`).join(' · ')

/**
 * Insights — the straight read on the Library. We surface only the findings that
 * actually compute off this brand's data, grouped by category. No levels, points, or
 * locked teasers: if there isn't enough data to say something yet, it simply isn't here.
 * Everything updates on its own as the library grows.
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

      <FindingsCharts items={items} />

      {groups.map(({ category, found }) => (
        <section className="lfind-group" key={category}>
          <div className="lfind-head">{category}</div>
          <div className="lfind-list">
            {found.map((u) => (
              <div className="lfind" key={u.id}>
                <div className="lfind-title">{u.title}</div>
                <div className="lfind-text">{u.finding}</div>
                {u.sources.length > 0 && (
                  <div className="lfind-src">based on {sourceLine(u.sources)}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
