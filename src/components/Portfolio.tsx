import { useTrafficStore } from '../store/useTrafficStore'
import { HomeChat } from './HomeChat'
import { PortfolioCockpit } from './PortfolioCockpit'

/**
 * Home — the landing: a greeting, an Ask box, and the triage board (what's due next,
 * what needs attention). Submitting a question flips the whole page into a full-page
 * conversational chat (HomeChat) grounded in the same campaign data.
 */
export function Portfolio() {
  const homeChatOpen = useTrafficStore((s) => s.homeChatOpen)
  if (homeChatOpen) return <HomeChat />
  return (
    <div className="pf pf-home">
      <PortfolioCockpit embedded />
    </div>
  )
}
