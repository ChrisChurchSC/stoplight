import { useMemo, useState } from 'react'
import { computeDataUnlocks, type DataUnlock } from '../domain/dataUnlocks'
import type { TrafficRow } from '../domain/types'

/**
 * Data — the gamified read on the Library. A large, progressive catalog of insights you
 * earn by pairing messaging with data over time. Every unlock has real gates (content,
 * metrics, tags, a connected source, and often months of history), a live progress bar,
 * and, once open, its actual finding computed off the brand's own library. Most of the
 * catalog is locked today and lights up on its own as the brand keeps publishing and
 * measuring. Grouped by category, filterable by state, and paced by a level system.
 */

const num = (n: number) => n.toLocaleString()

type Filter = 'all' | 'unlocked' | 'reach' | 'locked'
const cardState = (u: DataUnlock): 'unlocked' | 'reach' | 'locked' =>
  u.unlocked ? 'unlocked' : u.progress >= 0.6 ? 'reach' : 'locked'

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
  const [filter, setFilter] = useState<Filter>('all')

  if (!items.length) {
    return <div className="mtx-empty">Ingest this brand's content first — the data unlocks fill in as the library grows.</div>
  }

  const counts = {
    all: prog.total,
    unlocked: prog.unlocks.filter((u) => u.unlocked).length,
    reach: prog.unlocks.filter((u) => cardState(u) === 'reach').length,
    locked: prog.unlocks.filter((u) => cardState(u) === 'locked').length,
  }
  const match = (u: DataUnlock) => (filter === 'all' ? true : filter === 'unlocked' ? u.unlocked : cardState(u) === filter)

  // Level ring geometry.
  const R = 34
  const CIRC = 2 * Math.PI * R
  const ringPct = prog.total ? prog.unlockedCount / prog.total : 0

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unlocked', label: 'Unlocked' },
    { key: 'reach', label: 'In reach' },
    { key: 'locked', label: 'Locked' },
  ]

  return (
    <div className="ldata">
      <header className="mtx-head">
        <h2>Data unlocks</h2>
        <span className="mtx-sub">
          {prog.total} insights you earn by pairing messaging with data over time. Each one opens when its gates are met;
          many need months of history. The bars fill on their own as the library grows.
        </span>
      </header>

      {/* Hero — level, ring, points, next unlock. */}
      <div className="ldata-hero">
        <div className="ldata-ring">
          <svg viewBox="0 0 84 84" width="84" height="84" aria-hidden="true">
            <circle cx="42" cy="42" r={R} className="ldata-ring-bg" />
            <circle
              cx="42"
              cy="42"
              r={R}
              className="ldata-ring-fg"
              strokeDasharray={`${(CIRC * ringPct).toFixed(1)} ${CIRC.toFixed(1)}`}
              transform="rotate(-90 42 42)"
            />
          </svg>
          <div className="ldata-ring-mid">
            <span className="ldata-ring-lvl">{prog.level}</span>
          </div>
        </div>
        <div className="ldata-hero-main">
          <div className="ldata-hero-lvl">
            Level {prog.level} · <strong>{prog.levelName}</strong>
          </div>
          <div className="ldata-hero-bar">
            <div className="ldata-hero-bar-fill" style={{ width: `${Math.round(ringPct * 100)}%` }} />
          </div>
          <div className="ldata-hero-meta">
            <span>
              <b>{prog.unlockedCount}</b> of {prog.total} unlocked
            </span>
            <span className="ldata-dot">·</span>
            <span>
              <b>{num(prog.points)}</b> / {num(prog.maxPoints)} data points
            </span>
            {prog.unlockedCount < prog.total && (
              <>
                <span className="ldata-dot">·</span>
                <span>{prog.nextLevelAt - prog.unlockedCount} more to level up</span>
              </>
            )}
          </div>
        </div>
        {prog.next && (
          <div className="ldata-next">
            <div className="ldata-next-label">Next unlock</div>
            <div className="ldata-next-title">{prog.next.title}</div>
            <div className="ldata-next-gap">
              {Math.max(0, prog.next.threshold - prog.next.current)} more {prog.next.metric} to go
            </div>
            <div className="ldata-next-bar">
              <div className="ldata-next-bar-fill" style={{ width: `${Math.round(prog.next.progress * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Filter bar. */}
      <div className="ldata-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`ldata-filter${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <span className="ldata-filter-n">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {/* Categories. */}
      {prog.byCategory.map(({ category, unlocks, unlocked }) => {
        const shown = unlocks.filter(match)
        if (!shown.length) return null
        return (
          <section className="ldata-tier" key={category}>
            <div className="ldata-tier-head">
              <span className="ldata-tier-name">{category}</span>
              <span className="ldata-tier-count">
                {unlocked}/{unlocks.length}
              </span>
              <div className="ldata-tier-track">
                <div className="ldata-tier-fill" style={{ width: `${(unlocked / unlocks.length) * 100}%` }} />
              </div>
            </div>
            <div className="ldata-grid">
              {shown.map((u) => (
                <UnlockCard key={u.id} u={u} />
              ))}
            </div>
          </section>
        )
      })}

      <div className="mtx-foot">
        Locked doesn't mean unavailable forever — it means not enough data yet, or not held long enough. Keep publishing,
        tag content to audiences, connect a source, and the bars climb until each insight opens on its own.
      </div>
    </div>
  )
}

function UnlockCard({ u }: { u: DataUnlock }) {
  const state = cardState(u)
  const pct = Math.round(u.progress * 100)
  const badge = u.unlocked ? 'Unlocked' : state === 'reach' ? 'In reach' : 'Locked'
  return (
    <article className={`ldata-card ${state}`}>
      <div className="ldata-card-top">
        <span className="ldata-card-ico" aria-hidden="true">
          {u.unlocked ? '✓' : state === 'reach' ? '◆' : '🔒'}
        </span>
        <span className="ldata-card-title">{u.title}</span>
        <span className={`ldata-badge ${state}`}>{badge}</span>
      </div>
      <p className="ldata-card-reveal">{u.reveal}</p>
      {u.unlocked && u.finding ? (
        <div className="ldata-finding">
          <span className="ldata-finding-ico" aria-hidden="true">✦</span>
          <span className="ldata-finding-text">{u.finding}</span>
        </div>
      ) : (
        <>
          {u.example && (
            <div className="ldata-preview">
              <span className="ldata-preview-label">Will tell you</span>
              <span className="ldata-preview-text">{u.example}</span>
            </div>
          )}
          <div className="ldata-card-prog">
            <div className="ldata-card-track">
              <div className={`ldata-card-fill ${state}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <div className="ldata-card-nums">
              <span className="ldata-card-cur">
                {num(u.current)} <span className="ldata-card-metric">/ {num(u.threshold)} {u.metric}</span>
              </span>
              <span className="ldata-card-pct">{`${pct}%`}</span>
            </div>
          </div>
        </>
      )}
      {u.unlocked && (
        <div className="ldata-card-foot">
          {u.finding && (
            <span className="ldata-card-done">
              {num(u.current)} {u.metric}
            </span>
          )}
          {u.where && <span className="ldata-card-where">↳ {u.where}</span>}
        </div>
      )}
    </article>
  )
}
