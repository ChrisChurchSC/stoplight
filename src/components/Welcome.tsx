import { useEffect, useState } from 'react'
import { BUILD_BRAND_SEED, GUIDED_SETUP_SEED } from '../domain/guidedSetup'
import { MARKETER_ROLES, SKILL_LEVELS, type MarketerRole, type SkillLevel } from '../domain/userPrefs'
import { useTrafficStore } from '../store/useTrafficStore'
import { Wordmark } from './Wordmark'

/**
 * Phase A of setup: about you, then straight into your first brand.
 *
 * The two preference questions used to sit on Home as chip rows, competing with the tour, the
 * checklist and two start cards for the same blank screen. They are asked here instead, one at a
 * time, with nothing else showing.
 *
 * The last step hands off into brand setup rather than dropping you on Home to find it yourself.
 * The brand is what everything downstream is built from (voice, audiences, proof, then campaigns),
 * so onboarding should end with it started, not with a list of things you could do. Both routes are
 * the same two the Home row offers, so there is still exactly one way to set a brand up.
 *
 * Shows only for a workspace with no brands that has never resolved onboarding. An existing
 * workspace is stamped as resolved without ever being asked, so nobody already working meets a wall.
 */
export function Welcome() {
  const userPrefs = useTrafficStore((s) => s.userPrefs)
  const setUserPrefs = useTrafficStore((s) => s.setUserPrefs)
  const openHomeChat = useTrafficStore((s) => s.openHomeChat)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const clientList = useTrafficStore((s) => s.clientList)
  const flightsHydrated = useTrafficStore((s) => s.flightsHydrated)
  const sharedSession = useTrafficStore((s) => s.sharedSession)

  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [role, setRole] = useState<MarketerRole | null>(null)
  const [skill, setSkill] = useState<SkillLevel | null>(null)

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

  // Record the answers and stand down. `seed` opens the chosen brand-setup route on the way out;
  // without one we just land on Home, where the same two routes are the first thing on the page.
  const complete = (seed?: string) => {
    setUserPrefs({
      ...(role ? { marketerRole: role } : {}),
      ...(skill ? { skillLevel: skill } : {}),
      onboardedAt: Date.now(),
    })
    if (seed) openHomeChat(seed)
  }

  return (
    <div className="wel" role="dialog" aria-label="Welcome to Breadcrumbs">
      <div className="wel-inner">
        <div className="wel-mark">
          <Wordmark />
        </div>

        {step === 0 && (
          <div className="wel-step">
            <div className="wel-count">Step 1 of 3</div>
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
        )}

        {step === 1 && (
          <div className="wel-step">
            <div className="wel-count">Step 2 of 3</div>
            <h1 className="wel-q">How much do you want to see?</h1>
            <p className="wel-sub">
              Simple keeps the surface calm and the fields few. Nothing is ever hidden for good, and
              you can switch at any time.
            </p>
            <div className="wel-opts">
              {SKILL_LEVELS.map((s) => (
                <button
                  key={s.value}
                  className="wel-opt"
                  onClick={() => {
                    setSkill(s.value)
                    setStep(2)
                  }}
                >
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
              <button className="wel-skip" onClick={() => setStep(2)}>
                Skip this
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wel-step">
            <div className="wel-count">Step 3 of 3</div>
            <h1 className="wel-q">Set up your first brand</h1>
            <p className="wel-sub">
              Everything is built from this: your voice, your audiences, the proof your campaigns lean
              on. Pick how you want to start and we will do it together.
            </p>
            <div className="wel-opts">
              <button className="wel-opt" onClick={() => complete(BUILD_BRAND_SEED)}>
                <span className="wel-opt-label">Draft it from my website</span>
                <span className="wel-opt-hint">
                  Point us at your site and we draft your voice, audiences and proof from your real
                  content, for you to edit.
                </span>
              </button>
              <button className="wel-opt" onClick={() => complete(GUIDED_SETUP_SEED)}>
                <span className="wel-opt-label">Walk me through it</span>
                <span className="wel-opt-hint">
                  A guided setup, one short question at a time. Every answer creates something real.
                </span>
              </button>
            </div>
            <div className="wel-foot">
              <button className="wel-back" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="wel-skip" onClick={() => complete()}>
                I&rsquo;ll do this later
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
