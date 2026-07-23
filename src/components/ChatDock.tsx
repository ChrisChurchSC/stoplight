import { useTrafficStore } from '../store/useTrafficStore'
import { HomeChat } from './HomeChat'

/**
 * The assistant as a global companion, not a page.
 *
 * The full chat used to live inside the Home page, and opening it navigated you there. It is
 * mounted here at the shell instead: a launcher summons it from any page, it overlays wherever you
 * are, and closing it leaves you exactly where you were. The one place it stays out of the way is
 * the flow canvas, which already has its own campaign-scoped chat (unifying the two is the next
 * step, deferred on purpose).
 */
export function ChatDock() {
  const open = useTrafficStore((s) => s.homeChatOpen)
  const session = useTrafficStore((s) => s.homeChatSession)
  const newHomeChat = useTrafficStore((s) => s.newHomeChat)
  // Hide the launcher on the flow canvas (its FlowChat is the chat there) and while the overlay is
  // already open. `sharedSession` viewers get no assistant at all.
  const flowCanvasOpen = useTrafficStore((s) => s.flowCanvasOpen)
  const sharedSession = useTrafficStore((s) => s.sharedSession)

  if (sharedSession) return null

  return (
    <>
      {open && (
        <div className="chat-overlay" role="dialog" aria-label="Assistant">
          {/* Keyed by session so opening a new or saved chat remounts a fresh thread. */}
          <HomeChat key={session} />
        </div>
      )}
      {!open && !flowCanvasOpen && (
        <button className="chat-fab" onClick={() => newHomeChat()} title="Ask the assistant" aria-label="Ask the assistant">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 4H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4v3l4-3h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z" />
          </svg>
          <span className="chat-fab-label">Ask</span>
        </button>
      )}
    </>
  )
}
