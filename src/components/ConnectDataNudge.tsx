import { useState } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * A dismissible bottom-right nudge to connect Claude to the data aggregator, so campaigns
 * can be built from real performance. Hidden once dismissed (persisted) and on the Connect
 * Claude page itself, where the prompt would be redundant.
 */

const KEY = 'stoplight.connectNudge.dismissed.v1'

export function ConnectDataNudge() {
  const page = useTrafficStore((s) => s.page)
  const setPage = useTrafficStore((s) => s.setPage)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })

  if (dismissed || page === 'connectors') return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="connect-nudge" role="dialog" aria-label="Connect Claude to your data">
      <button className="connect-nudge-x" onClick={dismiss} aria-label="Dismiss">
        ✕
      </button>
      <span className="connect-nudge-ico">✦</span>
      <div className="connect-nudge-body">
        <strong>Build campaigns from your data</strong>
        <span>
          Connect Claude to a data aggregator (Summer, Supermetrics, or Agency Analytics) to develop campaigns based on
          real performance.
        </span>
        <button
          className="connect-nudge-cta"
          onClick={() => {
            setPage('connectors')
            dismiss()
          }}
        >
          Connect Claude →
        </button>
      </div>
    </div>
  )
}
