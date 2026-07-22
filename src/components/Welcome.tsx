import { useEffect, useState } from 'react'
import { MARKETER_ROLES, SKILL_LEVELS, type MarketerRole, type SkillLevel } from '../domain/userPrefs'
import { useTrafficStore } from '../store/useTrafficStore'
import { Wordmark } from './Wordmark'

/**
 * Phase A of setup: the "about you" sequence.
 *
 * These two questions used to sit on Home as chip rows, competing with the tour, the getting-started
 * checklist and two start cards for the same blank screen. They are asked here instead, one at a
 * time, with nothing else on screen, because that is the whole job of this surface. Nothing is asked
 * about the BRAND here: that is Phase B (the setup path), which starts the moment this ends.
 *
 * Shows only for a workspace with no brands that has never resolved onboarding. An existing
 * workspace is stamped as resolved without ever being asked, so nobody who is already working gets
 * a wall on their next load.
 */
export function Welcome() {
  const userPrefs = useTrafficStore((s) => s.userPrefs)
  const setUserPrefs = useTrafficStore((s) => s.setUserPrefs)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const clientList = useTrafficStore((s) => s.clientList)
  const flightsHydrated = useTrafficStore((s) => s.flightsHydrated)
  const sharedSession = useTrafficStore((s) => s.sharedSession)

  const [step, setStep] = useState<0 | 1>(0)
  const [role, setRole] = useState<MarketerRole | null>(null)

  const fresh = Object.keys(clientProfiles).length === 0 && clientList.length === 0
  // Wait for hydration before judging emptiness, or an existing workspace flashes this on every load.
  const unresolved = userPrefs.onboardedAt == null
  const show = flightsHydrated && unresolved && fresh && !sharedSession

  // A workspace that already has brands never needed this. Stamp it once so the question is settled
  // and deleting every brand later cannot resurrect a first-run screen.
  useEffect(() => {
    if (flightsHydrated && unresolved && !fresh) setUserPrefs({ onboardedAt: Date.now() })
  }, [flightsHydrated, unresolved, fresh, setUserPrefs])

  if (!show) return null

  const finish = (skillLevel: SkillLevel | null) =>
    setUserPrefs({
      ...(role ? { marketerRole: role } : {}),
      ...(skillLevel ? { skillLevel } : {}),
      onboardedAt: Date.now(),
    })

  return (
    <div className="wel" role="dialog" aria-label="Welcome to Breadcrumbs">
      <div className="wel-inner">
        <div className="wel-mark">
          <Wordmark />
        </div>

        {step === 0 ? (
          <div className="wel-step" key="role">
            <div className="wel-count">Question 1 of 2</div>
            <h1 className="wel-q">What do you work on?</h1>
            <p className="wel-sub">
              This sets your starting go-to-market motion and what leads in every view. You can change
              it whenever you like.
            </p>
            <div className="wel-opts">
              {MARKETER_ROLES.map((r) => (
                <button
                  key={r.value}
                  className="wel-opt"
                  onClick={() => {
                    setRole(r.value)
                    setStep(1)
                  }}
                >
                  <span className="wel-opt-label">{r.label}</span>
                  <span className="wel-opt-hint">{r.hint}</span>
                </button>
              ))}
            </div>
            <button className="wel-skip" onClick={() => setStep(1)}>
              Skip this
            </button>
          </div>
        ) : (
          <div className="wel-step" key="skill">
            <div className="wel-count">Question 2 of 2</div>
            <h1 className="wel-q">How much do you want to see?</h1>
            <p className="wel-sub">
              Simple keeps the surface calm and the fields few. Nothing is ever hidden for good, and
              you can switch at any time.
            </p>
            <div className="wel-opts">
              {SKILL_LEVELS.map((s) => (
                <button key={s.value} className="wel-opt" onClick={() => finish(s.value)}>
                  <span className="wel-opt-label">{s.label}</span>
                  <span className="wel-opt-hint">{s.hint}</span>
                </button>
              ))}
            </div>
            <div className="wel-foot">
              <button className="wel-back" onClick={() => setStep(0)}>
                Back
              </button>
              {/* Skipping leaves skillLevel alone so resolveSkillDefault still picks one from the
                  shape of the workspace. Skipping costs nothing. */}
              <button className="wel-skip" onClick={() => finish(null)}>
                Skip this
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
