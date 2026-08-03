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

/**
 * Every way out of this page goes to "/", and each one used to PUSH a history entry — which left
 * the changelog sitting directly behind the app. The app is one document with no routing of its
 * own, so that made the changelog the target of any stray back gesture: a two-finger scroll with a
 * little sideways drift on the Grid or a flow would blow the whole session away and hard-load this
 * page. Replacing the entry instead means leaving here is a return, not a step deeper, and nothing
 * in the app has the changelog behind it.
 *
 * Modified clicks (cmd/ctrl/shift/alt, middle button) are left alone so "open in a new tab" still
 * works, and the href stays real so the links remain links to the browser and to assistive tech.
 */
function leaveToApp(e: React.MouseEvent<HTMLAnchorElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  window.location.replace('/')
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
        {/* The left slot used to hold a "What's new" pill, which named the page you were already
            looking at — the <h1> below says that, and says it louder. A way back to the sign-in
            field is the thing this page actually lacked. */}
        <div className="chlog-nav-side">
          <a className="chlog-back" href="/" aria-label="Back to login" onClick={leaveToApp}>
            <span className="chlog-back-arrow" aria-hidden="true">
              &larr;
            </span>
            <span className="chlog-back-label">Back to login</span>
          </a>
        </div>
        {/* The splash wordmark, not the flat one — this page is the first thing a logged-out
            visitor sees after the sign-in field, so it should be wearing the same face. */}
        <a className="chlog-brand" href="/" aria-label="Breadcrumbs home" onClick={leaveToApp}>
          <img className="chlog-brand-logo" src="/login-logo.svg" alt="Breadcrumbs" />
        </a>
        <div className="chlog-nav-side chlog-nav-right">
          <a className="chlog-open" href="/" onClick={leaveToApp}>
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
        <a className="chlog-foot-link" href="/" onClick={leaveToApp}>
          Open Breadcrumbs
        </a>
      </footer>
    </div>
  )
}
