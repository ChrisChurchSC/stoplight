import { useEffect, useState } from 'react'
import { GUIDED_SETUP_SEED } from '../domain/guidedSetup'
import { useTrafficStore } from '../store/useTrafficStore'
import { HomeChat } from './HomeChat'
import { Wordmark } from './Wordmark'

/**
 * The first run: one conversation, on its own surface.
 *
 * It began as a card stepper for the two preference questions that then handed off into a chat for
 * the brand, which made setup feel like two places bolted together, and put a seam right at the
 * point where the user was finally telling us something real. It is one thread now: what you work
 * on, how much you want to see, then your brand, all in the same conversation, so every answer stays
 * visible above the next question and going back is just scrolling.
 *
 * This component is only the frame. The questions live in GUIDED_SETUP_STEPS and are asked by the
 * chat itself; all this does is host it away from the app, decide when the first run is over, and
 * carry the conversation across into the workspace.
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

  // True once the run has genuinely started, so the surface keeps rendering after the conversation
  // creates the brand. Gating purely on emptiness tore this down mid-sentence the moment the brand
  // existed, which unmounted the chat and lost the transcript.
  const [started, setStarted] = useState(false)

  const fresh = Object.keys(clientProfiles).length === 0 && clientList.length === 0
  // Wait for hydration before judging emptiness, or an existing workspace flashes this on every load.
  const unresolved = userPrefs.onboardedAt == null
  const show = flightsHydrated && unresolved && !sharedSession && (fresh || started)

  useEffect(() => {
    if (show && !started) setStarted(true)
  }, [show, started])

  // A workspace that already has brands never needed this. Stamp it once so the question is settled
  // and deleting every brand later cannot resurrect a first run. Never while the conversation is
  // running: ending onboarding unmounts this component, and with it the chat mid-sentence.
  useEffect(() => {
    if (started) return
    if (flightsHydrated && unresolved && !fresh) setUserPrefs({ onboardedAt: Date.now() })
  }, [started, flightsHydrated, unresolved, fresh, setUserPrefs])

  if (!show) return null

  // Cross into the workspace, carrying the conversation with you. The chat is saved after every
  // settled turn, so reopening the newest one means the app picks up exactly where this left off
  // rather than greeting the user with an empty chat that has forgotten their answers.
  const enterWorkspace = () => {
    const latest = useTrafficStore.getState().homeChats[0]
    if (latest) openSavedHomeChat(latest.id)
    // Only the stamp. The role was saved as it was answered, and re-sending it here would fire
    // setUserPrefs' role-landing, throwing the user onto a working page they did not ask for.
    setUserPrefs({ onboardedAt: Date.now() })
  }

  return (
    <div className="wel wel-setup" role="dialog" aria-label="Welcome to Breadcrumbs">
      <div className="wel-setup-head">
        <Wordmark />
        <span className="wel-setup-step">Setting up</span>
        {/* Appears once the brand is real, so leaving is a choice rather than something that happens
            to the user part-way through a sentence. */}
        {!fresh && (
          <button className="wel-setup-go" onClick={enterWorkspace}>
            Go to my workspace
          </button>
        )}
      </div>
      <div className="wel-setup-body">
        <HomeChat key="onboarding" embedded seed={GUIDED_SETUP_SEED} />
      </div>
    </div>
  )
}
