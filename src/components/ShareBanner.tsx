import { ROLE_META } from '../domain/access'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Persistent banner shown to anyone who opened the app through a share link. It
 * names the client and role so the limited surface never feels like a bug, and
 * lets the operator (testing a link) drop back to the full owner view.
 */
export function ShareBanner() {
  const ss = useTrafficStore((s) => s.sharedSession)
  const exit = useTrafficStore((s) => s.exitSharedSession)
  if (!ss) return null
  const meta = ROLE_META[ss.role]

  return (
    <div className="share-banner">
      <span className="share-banner-spark">✦</span>
      <span className="share-banner-text">
        Shared view · you're seeing <strong>{ss.client}</strong> as <strong>{meta.label}</strong>. {meta.blurb}
      </span>
      <span className="spacer" />
      <button className="share-banner-exit" onClick={exit}>
        Exit shared view
      </button>
    </div>
  )
}
