import { useEffect } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * A single transient toast at the bottom of the screen for lightweight recommendations
 * (e.g. a campaign budget that isn't allocated to any paid media) and for undo after a soft
 * delete. Auto-dismisses after a few seconds; click to dismiss early. Driven by the store's
 * `toast` string plus an optional `toastAction` (e.g. "Undo").
 */
export function Toast() {
  const toast = useTrafficStore((s) => s.toast)
  const toastAction = useTrafficStore((s) => s.toastAction)
  const showToast = useTrafficStore((s) => s.showToast)
  const tone = useTrafficStore((s) => s.toastTone)

  useEffect(() => {
    if (!toast) return
    // Give an actionable toast (undo) a bit longer to be noticed and clicked.
    const t = window.setTimeout(() => showToast(null), tone === 'warn' ? 14000 : toastAction ? 9000 : 6000)
    return () => window.clearTimeout(t)
  }, [toast, toastAction, showToast, tone])

  if (!toast) return null
  return (
    <div className={`toast${tone === 'warn' ? ' warn' : ''}`} role="status" onClick={() => showToast(null)}>
      <span className="toast-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h0" />
        </svg>
      </span>
      <span className="toast-msg">{toast}</span>
      {toastAction && (
        <button
          className="toast-action"
          onClick={(e) => {
            e.stopPropagation()
            toastAction.run()
            showToast(null)
          }}
        >
          {toastAction.label}
        </button>
      )}
      <button className="toast-x" aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); showToast(null) }}>✕</button>
    </div>
  )
}
