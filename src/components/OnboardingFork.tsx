import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The fork at onboarding: two clear, neutrally-presented routes into setup that
 * both land at the SAME connected map.
 *
 *  - Do it yourself  → the manual connect + confirm flow (the SetupWizard). The
 *    reliable floor, for the user who wants control or is wary of handing the
 *    keys to AI on day one.
 *  - Set it up with Claude → hands off to the desktop app, where Claude connects
 *    the tools and crawls the site agentically. The "paste and go" wow layer.
 *
 * Per the brief: present both clearly, don't push automated on the control-wary;
 * the user self-selects. See ClaudeHandoff.tsx for the assisted route.
 */
export function OnboardingFork() {
  const open = useTrafficStore((s) => s.onboardOpen)
  const close = useTrafficStore((s) => s.closeOnboard)
  const openSetup = useTrafficStore((s) => s.openSetup)
  const openAssisted = useTrafficStore((s) => s.openAssisted)

  if (!open) return null

  const goManual = () => {
    close()
    openSetup()
  }

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <div className="onboard-fork" role="dialog" aria-label="Set up a brand">
        <button className="onboard-x" onClick={close} aria-label="Close">
          ✕
        </button>
        <div className="onboard-head">
          <h2 className="onboard-title">Set up your brand</h2>
          <p className="onboard-sub">
            Both routes build the same connected map. The only difference is how you get there.
          </p>
        </div>

        <div className="fork-choices">
          <button className="fork-choice" onClick={goManual}>
            <span className="fork-ico">✎</span>
            <span className="fork-name">Do it yourself</span>
            <span className="fork-desc">
              You stay in control. Connect your sources, confirm the map, set it up by hand.
            </span>
            <span className="fork-go">Start manual →</span>
          </button>

          <button className="fork-choice accent" onClick={openAssisted}>
            <span className="fork-ico">✦</span>
            <span className="fork-name">Set it up with Claude</span>
            <span className="fork-desc">
              Claude takes over in the desktop app: connects everything, reads your site, and
              builds the map. Paste and go.
            </span>
            <span className="fork-go">Open Claude →</span>
          </button>
        </div>

        <p className="fork-foot">
          Not sure? Start manual — you can switch to Claude anytime.
        </p>
      </div>
    </>
  )
}
