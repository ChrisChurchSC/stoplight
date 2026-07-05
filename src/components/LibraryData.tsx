import { useMemo } from 'react'
import { computeDataUnlocks, type DataUnlock } from '../domain/dataUnlocks'
import type { TrafficRow } from '../domain/types'

/**
 * Data — the gamified read on the Library. Every insight Hyperfocus can give a brand
 * sits on a floor of data: you can't rank proof points off three posts or forecast
 * reach off a handful of metrics. This turns that floor into a progression the brand
 * climbs by ingesting, tagging, connecting, and publishing. Each card has a real
 * threshold and a live current value, so the bars fill as the brand's data grows and
 * the locked insights unlock themselves. Same signal, once there's enough of it.
 */

const num = (n: number) => n.toLocaleString()

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
    return <div className="mtx-empty">Ingest this brand's content first — the data unlocks fill in as the library grows.</div>
  }

  // Level ring geometry.
  const R = 34
  const CIRC = 2 * Math.PI * R
  const ringPct = prog.total ? prog.unlockedCount / prog.total : 0

  return (
    <div className="ldata">
      <header className="mtx-head">
        <h2>Data unlocks</h2>
        <span className="mtx-sub">
          Every insight needs a floor of data underneath it. Here's what's unlocked, what's close, and what a little
          more data will open up — the bars fill on their own as the library grows.
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
              <b>{prog.unlockedCount}</b> of {prog.total} insights unlocked
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

      {/* Tiers. */}
      {prog.byTier.map(({ tier, unlocks }) => (
        <section className="ldata-tier" key={tier}>
          <div className="ldata-tier-head">
            <span className="ldata-tier-name">{tier}</span>
            <span className="ldata-tier-count">
              {unlocks.filter((u) => u.unlocked).length}/{unlocks.length}
            </span>
          </div>
          <div className="ldata-grid">
            {unlocks.map((u) => (
              <UnlockCard key={u.id} u={u} isNext={prog.next?.id === u.id} />
            ))}
          </div>
        </section>
      ))}

      <div className="mtx-foot">
        Locked doesn't mean unavailable forever — it means not enough data yet. Ingest more content, tag it to
        audiences, connect another source, and the bars climb until the insight opens on its own.
      </div>
    </div>
  )
}

function UnlockCard({ u, isNext }: { u: DataUnlock; isNext: boolean }) {
  const state = u.unlocked ? 'unlocked' : isNext ? 'next' : 'locked'
  const pct = Math.round(u.progress * 100)
  return (
    <article className={`ldata-card ${state}`}>
      <div className="ldata-card-top">
        <span className="ldata-card-ico" aria-hidden="true">
          {u.unlocked ? '✓' : isNext ? '◆' : '🔒'}
        </span>
        <span className="ldata-card-title">{u.title}</span>
        <span className={`ldata-badge ${state}`}>{u.unlocked ? 'Unlocked' : isNext ? 'In reach' : 'Locked'}</span>
      </div>
      <p className="ldata-card-reveal">{u.reveal}</p>
      {u.unlocked && u.finding ? (
        <div className="ldata-finding">
          <span className="ldata-finding-ico" aria-hidden="true">✦</span>
          <span className="ldata-finding-text">{u.finding}</span>
        </div>
      ) : (
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
