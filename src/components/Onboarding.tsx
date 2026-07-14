import { useTrafficStore } from '../store/useTrafficStore'
import { SetupFlow } from './SetupFlow'

/**
 * Full-page first-run onboarding. A takeover (fixed, full viewport) that new users
 * land on instead of the app — no sidebar, no scrim. Driven by the `onboardingActive`
 * store flag (set by Workbench's first-run effect). Renders the shared `SetupFlow`;
 * "Skip for now" and a successful build both exit to the app.
 */
export function Onboarding() {
  const active = useTrafficStore((s) => s.onboardingActive)
  const exit = useTrafficStore((s) => s.exitOnboarding)

  if (!active) return null

  return (
    <div className="onboarding-root" role="dialog" aria-label="Welcome to Breadcrumbs">
      <header className="onboarding-head">
        <div className="onboarding-brand">
          <span className="onboarding-logo">✦</span>
          Breadcrumbs
        </div>
        <button className="btn ghost sm" onClick={exit}>
          Skip for now
        </button>
      </header>
      <div className="onboarding-body">
        <div className="onboarding-panel">
          <SetupFlow variant="page" onDone={exit} />
        </div>
      </div>
    </div>
  )
}
