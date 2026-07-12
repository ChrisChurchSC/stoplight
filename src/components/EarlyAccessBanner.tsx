import { useState } from 'react'

const KEY = 'stoplight.eaBannerDismissed.v1'

/**
 * A quiet, dismissible pilot notice: data is browser-local for now (no server sync yet). Shown once
 * until dismissed. Remove this (and the render in App) once data persists server-side.
 */
export function EarlyAccessBanner() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(KEY) === '1')
  if (dismissed) return null
  return (
    <div className="ea-banner" role="status">
      <span className="ea-dot" aria-hidden="true" />
      <span className="ea-text">
        <strong>Early access.</strong> Your data is saved in this browser only — it won't sync across devices yet.
      </span>
      <button
        className="ea-close"
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem(KEY, '1')
          setDismissed(true)
        }}
      >
        ✕
      </button>
    </div>
  )
}
