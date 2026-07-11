import { useEffect } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * A single transient toast at the bottom of the screen for lightweight recommendations
 * (e.g. a campaign budget that isn't allocated to any paid media). Auto-dismisses after a few
 * seconds; click to dismiss early. Driven by the store's `toast` string.
 */
export function Toast() {
  const toast = useTrafficStore((s) => s.toast)
  const showToast = useTrafficStore((s) => s.showToast)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => showToast(null), 6000)
    return () => window.clearTimeout(t)
  }, [toast, showToast])

  if (!toast) return null
  return (
    <div className="toast" role="status" onClick={() => showToast(null)}>
      <span className="toast-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h0" />
        </svg>
      </span>
      <span className="toast-msg">{toast}</span>
      <button className="toast-x" aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); showToast(null) }}>✕</button>
    </div>
  )
}
