import { useEffect } from 'react'
import { Wordmark } from './Wordmark'

/**
 * A public, unauthenticated changelog ("What's new"). Rendered directly from main.tsx when the
 * path is /changelog, BEFORE the AuthGate and store load, so anyone can read it without signing
 * in (same idea as the anonymous ?share= viewer). Self-contained: only the wordmark and the
 * RELEASES data below, styled with the .chlog-* block in index.css. Dark, monospace-labelled,
 * flat entries: date, then a tag chip per kind of change, then the bullets.
 *
 * The dark is pinned by main.tsx (data-theme, before mount) rather than chosen here, because the
 * only way in is the black splash and the page must not arrive white for a light-OS visitor.
 */

type Tag = 'New' | 'Improved' | 'Fixed'
interface Release {
  version: string
  dateLabel: string
  groups: { tag: Tag; items: string[] }[]
}

// Newest first. Each entry is one shipped release, grouped by the kind of change.
// Reset to empty on 2 August 2026; every release up to v1.15 is in git history.
const RELEASES: Release[] = []

const TAG_CLASS: Record<Tag, string> = {
  New: 'chlog-tag-new',
  Improved: 'chlog-tag-improved',
  Fixed: 'chlog-tag-fixed',
}

export function ChangelogPage() {
  useEffect(() => {
    const prev = document.title
    document.title = "What's new · Breadcrumbs"
    return () => {
      document.title = prev
    }
  }, [])

  return (
    <div className="chlog">
      <header className="chlog-nav">
        <div className="chlog-nav-side">
          <span className="chlog-nav-active">What&rsquo;s new</span>
        </div>
        <a className="chlog-brand" href="/" aria-label="Breadcrumbs home">
          <Wordmark height={20} />
        </a>
        <div className="chlog-nav-side chlog-nav-right">
          <a className="chlog-open" href="/">
            Open app
          </a>
        </div>
      </header>

      <main className="chlog-main">
        <div className="chlog-head">
          <h1 className="chlog-eyebrow">What&rsquo;s new</h1>
          <p className="chlog-sub">Updates, new features, and fixes.</p>
        </div>

        <div className="chlog-feed">
          {RELEASES.length === 0 ? (
            <p className="chlog-empty">
              Nothing here yet &mdash; the next release will show up here.
            </p>
          ) : (
            RELEASES.map((r) => (
              <section className="chlog-entry" key={r.version}>
                <time className="chlog-date">{r.dateLabel}</time>
                {r.groups.map((g) => (
                  <div className="chlog-group" key={g.tag}>
                    <span className={`chlog-tag ${TAG_CLASS[g.tag]}`}>{g.tag}</span>
                    <ul className="chlog-items">
                      {g.items.map((it, i) => (
                        <li key={i}>{it}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      </main>

      <footer className="chlog-foot">
        <Wordmark height={16} />
        <span className="chlog-foot-tag">Leave a trail worth following.</span>
        <a className="chlog-foot-link" href="/">
          Open Breadcrumbs
        </a>
      </footer>
    </div>
  )
}
