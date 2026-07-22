import { useEffect, useState } from 'react'
import { BUILD_BRAND_SEED, GUIDED_SETUP_SEED } from '../domain/guidedSetup'
import { MARKETER_ROLES, SKILL_LEVELS, type MarketerRole, type SkillLevel } from '../domain/userPrefs'
import { useTrafficStore } from '../store/useTrafficStore'
import { HomeChat } from './HomeChat'
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
  const openSavedHomeChat = useTrafficStore((s) => s.openSavedHomeChat)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const clientList = useTrafficStore((s) => s.clientList)
  const flightsHydrated = useTrafficStore((s) => s.flightsHydrated)
  const sharedSession = useTrafficStore((s) => s.sharedSession)

  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [role, setRole] = useState<MarketerRole | null>(null)
  const [skill, setSkill] = useState<SkillLevel | null>(null)
  // 'setup' keeps the brand-setup conversation ON this surface instead of handing off to the app
  // mid-task. Onboarding ends by itself the moment a brand exists (see the stamp effect below),
  // so the workspace appears once, when there is finally something in it.
  const [phase, setPhase] = useState<'ask' | 'setup'>('ask')
  const [seed, setSeed] = useState<string>()

  const fresh = Object.keys(clientProfiles).length === 0 && clientList.length === 0
  // Wait for hydration before judging emptiness, or an existing workspace flashes this on every load.
  const unresolved = userPrefs.onboardedAt == null
  // `fresh || phase === 'setup'`: once a setup conversation is running here it has to KEEP running
  // here, even after it creates the brand. Gating on freshness alone tore this surface down the
  // instant the brand existed, mid-conversation, which reset the chat and lost the transcript.
  const show = flightsHydrated && unresolved && !sharedSession && (fresh || phase === 'setup')

  // A workspace that already has brands never needed this. Stamp it once so the question is settled
  // and deleting every brand later cannot resurrect a first-run screen.
  useEffect(() => {
    // Never while a setup conversation is running on this surface: ending onboarding unmounts this
    // component, which would tear down the chat mid-sentence and lose the transcript. Crossing into
    // the workspace is a deliberate act there (see "Go to my workspace" below).
    if (phase === 'setup') return
    if (flightsHydrated && unresolved && !fresh) setUserPrefs({ onboardedAt: Date.now() })
  }, [phase, flightsHydrated, unresolved, fresh, setUserPrefs])

  if (!show) return null

  const prefs = () => ({ ...(role ? { marketerRole: role } : {}), ...(skill ? { skillLevel: skill } : {}) })

  // Start a brand-setup route WITHOUT resolving onboarding: the conversation runs inside this
  // surface, and the stamp effect above ends onboarding when the brand actually exists. So the app
  // appears exactly once, around a workspace that now has something in it.
  const startSetup = (chosen: string) => {
    setUserPrefs(prefs())
    // Deliberately NOT openHomeChat: it sets page:'portfolio' in the same commit, which mounts a
    // second HomeChat in Portfolio behind this overlay. Both instances then ran their mount effect
    // and consumed the seed. The embedded instance below is the only one.
    setSeed(chosen)
    setPhase('setup')
  }

  // Leave without setting a brand up: resolve onboarding and land on Home, where the same two
  // routes are the first thing on the page.
  const leave = () => setUserPrefs({ ...prefs(), onboardedAt: Date.now() })

  // Cross into the workspace, carrying the conversation with you. The chat is saved after every
  // settled turn, so reopening the newest one means the app picks up exactly where this left off
  // instead of greeting you with a fresh, empty chat that has forgotten your answers.
  const enterWorkspace = () => {
    const latest = useTrafficStore.getState().homeChats[0]
    if (latest) openSavedHomeChat(latest.id)
    // Only the stamp. startSetup already saved the role, and re-sending it makes setUserPrefs fire
    // its role-landing again, which both threw you onto a working page you did not ask for and
    // overrode the page the reopened chat had just set.
    setUserPrefs({ onboardedAt: Date.now() })
  }

  if (phase === 'setup') {
    return (
      <div className="wel wel-setup" role="dialog" aria-label="Set up your brand">
        <div className="wel-setup-head">
          {/* The chat's own header is hidden here (its "back to Home" belongs to the app, not to a
              setup you are part-way through), so the way out lives on this frame instead. */}
          <button className="wel-setup-back" onClick={() => setPhase('ask')}>
            Back
          </button>
          <Wordmark />
          <span className="wel-setup-step">Setting up your brand</span>
          {/* Appears the moment the brand is real, so leaving is a choice rather than something that
              happens to you halfway through a sentence. */}
          {!fresh && (
            <button className="wel-setup-go" onClick={enterWorkspace}>
              Go to my workspace
            </button>
          )}
        </div>
        <div className="wel-setup-body">
          <HomeChat key="onboarding-setup" embedded seed={seed} onExit={() => setPhase('ask')} />
        </div>
      </div>
    )
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
              <button className="wel-opt" onClick={() => startSetup(BUILD_BRAND_SEED)}>
                <span className="wel-opt-label">Draft it from my website</span>
                <span className="wel-opt-hint">
                  Point us at your site and we draft your voice, audiences and proof from your real
                  content, for you to edit.
                </span>
              </button>
              <button className="wel-opt" onClick={() => startSetup(GUIDED_SETUP_SEED)}>
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
              <button className="wel-skip" onClick={leave}>
                I&rsquo;ll do this later
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
