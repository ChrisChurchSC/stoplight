import { useEffect, useState } from 'react'
import { onSaveTrouble, retryPersistedState, type SaveTrouble } from '../adapters/state/workspaceState'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Says out loud when your work isn't reaching your account.
 *
 * Everything the app saves goes to localStorage first and the workspace second, so a workspace
 * write that fails is invisible: this device reloads from its own copy and looks perfectly healthy,
 * and you only discover the gap by opening another browser and finding the campaigns you started
 * are not there. Persistent rather than a toast, deliberately — a message that auto-dismisses after
 * six seconds is the wrong way to tell someone their work is only on one machine.
 */
export function SaveBanner() {
  const [trouble, setTrouble] = useState<SaveTrouble | null>(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => onSaveTrouble(setTrouble), [])

  /**
   * A SHARE VIEWER HAS NO ACCOUNT FOR THE WORK TO REACH, and none of the work is theirs. Share
   * views run on localStorage by design, so the workspace write this warns about was never
   * attempted: the banner fires on "not signed in to a workspace", which for a recipient is the
   * normal and correct state. It read as "your changes are not being saved" across the top of a
   * read-only copy of a campaign they cannot change, above a Retry button with nothing to retry.
   */
  const shared = useTrafficStore((s) => !!s.sharedSession)

  if (shared || !trouble) return null

  const retry = async () => {
    setRetrying(true)
    // Resolves once the writes have been ATTEMPTED; the subscription above reports the outcome, so
    // the banner clears itself if they land and stays put with a fresh reason if they don't.
    await retryPersistedState()
    setRetrying(false)
  }

  return (
    <div className="save-banner" role="alert">
      <span className="save-banner-dot" aria-hidden="true" />
      <span className="save-banner-text">
        {trouble.signedOut
          ? 'Your recent changes are saved on this device only — no workspace is signed in, so they haven’t reached your account.'
          : 'Your recent changes are saved on this device only — they couldn’t be saved to your account.'}
        <span className="save-banner-why"> {trouble.message}</span>
      </span>
      <button className="save-banner-retry" disabled={retrying} onClick={retry}>
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  )
}
