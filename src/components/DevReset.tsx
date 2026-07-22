import { useState } from 'react'

/**
 * "Start from scratch": wipe this browser's workspace and reload, so the first-run flow can be
 * walked from the top as many times as it takes to get it right.
 *
 * DEV ONLY, deliberately. It never renders in a production build, for two reasons. It is a one-click
 * destroy-everything button, which has no business on a surface real people use. And it would not
 * even do what it says there: with Supabase configured, clearing localStorage only drops the local
 * cache, and the next load hydrates the workspace straight back from workspace_state. A true reset
 * of a deployed workspace means purging the server tables, which is not something a button should do.
 */
export function DevReset() {
  const [armed, setArmed] = useState(false)
  if (!import.meta.env.DEV) return null

  const wipe = () => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* storage unavailable, nothing to wipe */
    }
    location.reload()
  }

  return (
    <div className="devreset">
      {armed ? (
        <>
          <span className="devreset-q">Wipe this browser&rsquo;s workspace?</span>
          <button className="devreset-btn danger" onClick={wipe}>
            Wipe and reload
          </button>
          <button className="devreset-btn" onClick={() => setArmed(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button className="devreset-btn" onClick={() => setArmed(true)} title="Dev only: clear this browser's workspace and replay the first-run flow">
          <span className="devreset-tag">DEV</span>
          Start from scratch
        </button>
      )}
    </div>
  )
}
