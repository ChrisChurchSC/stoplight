import { useTrafficStore } from '../store/useTrafficStore'
import { HomeChat } from './HomeChat'
import { HomeAgenda } from './HomeAgenda'

/**
 * Home — an agenda-style landing: a "Coming up" card (what's due next), a day-grouped feed of
 * recent activity, and a docked Ask bar. Submitting a question flips the whole page into a
 * full-page conversational chat (HomeChat) grounded in the same campaign data.
 */
export function Portfolio() {
  const homeChatOpen = useTrafficStore((s) => s.homeChatOpen)
  // Keyed by the session counter so opening a new/saved chat remounts HomeChat with a fresh thread.
  const homeChatSession = useTrafficStore((s) => s.homeChatSession)
  if (homeChatOpen) return <HomeChat key={homeChatSession} />
  return (
    <div className="pf pf-home">
      <HomeAgenda />
    </div>
  )
}
