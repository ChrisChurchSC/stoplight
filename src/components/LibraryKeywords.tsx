import { compact, computeContentKeywords } from '../domain/contentSignals'
import type { TrafficRow } from '../domain/types'

/**
 * Keywords — the terms the brand's own content actually targets, pulled from every post
 * and page and weighted by what they drove. Not search-console demand (that's the SEO
 * connector); this is the language your library leans on, and which of those words travel
 * and convert. A fifth read over the library, beside Catalog / Signals / Map / Data.
 */

export function LibraryKeywords({ rows }: { rows: TrafficRow[] }) {
  const kw = computeContentKeywords(rows)

  if (!kw.total) {
    return (
      <div className="mtx-empty">
        Ingest this brand's content first — Keywords reads the copy for the terms it targets and how they perform.
      </div>
    )
  }

  const maxUse = Math.max(...kw.byUse.map((k) => k.posts), 1)
  const maxReach = Math.max(...kw.byReach.map((k) => k.avgReach), 1)
  const maxSubs = Math.max(...kw.bySubs.map((k) => k.subs), 1)

  return (
    <div className="sig">
      <header className="mtx-head">
        <h2>Keywords</h2>
        <span className="mtx-sub">
          {kw.total} keywords used across {kw.corpus} posts with copy · which terms your content leans on, and which
          ones travel and convert
        </span>
      </header>

      <section className="ins-card ins-wide">
        <div className="ins-card-head">
          <h3>Most-used keywords</h3>
          <span className="ins-card-hint">the words your library leans on, by how many posts use them</span>
        </div>
        <div className="sig-conv">
          {kw.byUse.map((k) => (
            <div className="sig-conv-row" key={k.term}>
              <span className="sig-conv-title">{k.term}</span>
              <span className="sig-conv-bar">
                <span className="sig-conv-fill" style={{ width: `${Math.round((k.posts / maxUse) * 100)}%` }} />
              </span>
              <span className="sig-conv-rate">{k.posts}</span>
              <span className="sig-conv-nums">
                {compact(k.avgReach)} avg reach{k.subs > 0 ? ` · +${k.subs} subs` : ''}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="ins-card ins-wide">
        <div className="ins-card-head">
          <h3>Keywords that travel</h3>
          <span className="ins-card-hint">terms whose posts reach the furthest, by average reach</span>
        </div>
        <div className="sig-conv">
          {kw.byReach.map((k) => (
            <div className="sig-conv-row" key={k.term}>
              <span className="sig-conv-title">
                {k.term} <em className="sig-pat-n">×{k.posts}</em>
              </span>
              <span className="sig-conv-bar">
                <span className="sig-conv-fill" style={{ width: `${Math.round((k.avgReach / maxReach) * 100)}%` }} />
              </span>
              <span className="sig-conv-rate">{compact(k.avgReach)}</span>
              <span className="sig-conv-nums">avg reach across {k.posts} posts</span>
            </div>
          ))}
        </div>
      </section>

      {kw.bySubs.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Keywords that convert</h3>
            <span className="ins-card-hint">terms on your subscriber-driving content</span>
          </div>
          <div className="sig-conv">
            {kw.bySubs.map((k) => (
              <div className="sig-conv-row" key={k.term}>
                <span className="sig-conv-title">
                  {k.term} <em className="sig-pat-n">×{k.posts}</em>
                </span>
                <span className="sig-conv-bar">
                  <span className="sig-conv-fill" style={{ width: `${Math.round((k.subs / maxSubs) * 100)}%` }} />
                </span>
                <span className="sig-conv-rate">+{k.subs}</span>
                <span className="sig-conv-nums">subs · {compact(k.avgReach)} avg reach</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {kw.phrases.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Phrases you repeat</h3>
            <span className="ins-card-hint">two-word terms that recur across the library</span>
          </div>
          <div className="sig-themes">
            {kw.phrases.map((p) => (
              <span className="sig-theme" key={p.term}>
                {p.term}
                <b>×{p.posts}</b>
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="mtx-foot">
        These are the keywords your content targets, ranked by what they drove. They are not Search Console demand:
        connect Search Console to overlay what people actually search, and see the gap between the words you use and
        the words that find you.
      </div>
    </div>
  )
}
