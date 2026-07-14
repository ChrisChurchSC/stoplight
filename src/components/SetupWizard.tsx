import { useTrafficStore } from '../store/useTrafficStore'
import { SetupFlow } from './SetupFlow'

/**
 * Modal shell for the setup flow — used when an existing user adds another client
 * later (the "Set up a brand" buttons in Clients/Library). First-run new users get
 * the full-page `Onboarding` instead. Both render the shared `SetupFlow`.
 */
export function SetupWizard() {
  const open = useTrafficStore((s) => s.setupOpen)
  const close = useTrafficStore((s) => s.closeSetup)

  if (!open) return null

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <div className="wiz setup-wiz" role="dialog" aria-label="Map a client from their site">
        <div className="wiz-head">
          <span className="setup-badge">✦ Map a client</span>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={close}>
            Close
          </button>
        </div>
        <div className="wiz-body">
          <SetupFlow variant="modal" onDone={close} />
        </div>
      </div>
    </>
  )
}
