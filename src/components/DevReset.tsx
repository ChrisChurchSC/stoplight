import { useState } from 'react'
import { signOut } from '../lib/session'

/**
 * "Start from scratch": sign out, wipe this browser's workspace, and land back on the splash, so
 * the first-run flow can be walked from the top as many times as it takes to get it right. It used
 * to reload in place, which dropped you back into the app you were trying to leave.
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

  /**
   * Sign out BEFORE clearing storage: supabase.auth.signOut() reads the refresh token out of
   * localStorage to revoke it server-side, so wiping first leaves a live session behind and the
   * next load signs you straight back in. Clearing the cache is not the same as ending a session.
   *
   * Then replace() rather than reload(), to '/' rather than the current URL. reload() re-renders
   * wherever you already were and keeps the query string, so a ?share= link would sail back
   * through the gate (AuthGate treats a valid share token as its own grant). replace() also keeps
   * the wiped state out of history, so Back does not walk into it.
   *
   * Landing signed-out at '/' IS the splash: AuthGate renders it whenever there is no session.
   * That holds whatever the splash looks like, so this does not date against a redesign of it.
   */
  const wipe = async () => {
    try {
      await signOut()
    } catch {
      /* no backend configured, or already signed out — the wipe still stands */
    }
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* storage unavailable, nothing to wipe */
    }
    location.replace('/')
  }

  return (
    <div className="devreset">
      {armed ? (
        <>
          <span className="devreset-q">Wipe this browser&rsquo;s workspace?</span>
          <button className="devreset-btn danger" onClick={() => void wipe()}>
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
