import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The assisted route's desktop handoff. Jumping from the web into the desktop
 * app can disorient if unframed, so this screen does the framing the brief asks
 * for: WHY we're opening Claude, what it will connect (incrementally, in
 * context — not one scary "grant everything" wall), reassurance that both routes
 * build the same map, and an always-available drop-back to the manual route.
 *
 * The agentic connect itself lives in the desktop app (the Rushhour MCP bridge —
 * see docs/claude-desktop-mcp.md). This screen is the seam that routes the user
 * there; the full agentic multi-tool connect is layered on top of it.
 */

// Connections Claude asks for one at a time, each justified in context.
const STEPS: { label: string; why: string }[] = [
  { label: 'Connect your Drive', why: 'so we can pull in your existing assets' },
  { label: 'Connect your ad accounts', why: 'to read what you have running live' },
  { label: 'Connect your CMS / site', why: 'to read your pages and messaging' },
  { label: 'Crawl your site → build the map', why: 'voice, audiences, claims, and proof' },
]

export function ClaudeHandoff() {
  const open = useTrafficStore((s) => s.assistedOpen)
  const close = useTrafficStore((s) => s.closeAssisted)
  const openSetup = useTrafficStore((s) => s.openSetup)

  if (!open) return null

  // Always escapable: drop from assisted back to the manual route at any point.
  const dropToManual = () => {
    close()
    openSetup()
  }

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <div className="assist" role="dialog" aria-label="Set up with Claude">
        <button className="onboard-x" onClick={close} aria-label="Close">
          ✕
        </button>

        <div className="assist-head">
          <span className="assist-ico">✦</span>
          <h2 className="onboard-title">Opening Claude to set up your brand</h2>
          <p className="onboard-sub">
            Connecting your tools is agentic work across your accounts, so it happens in the Claude
            desktop app — where Claude can act on your behalf. It asks for one thing at a time, and
            you confirm everything.
          </p>
        </div>

        <ol className="assist-steps">
          {STEPS.map((s, i) => (
            <li key={s.label} className="assist-step">
              <span className="assist-step-n">{i + 1}</span>
              <span className="assist-step-body">
                <span className="assist-step-label">{s.label}</span>
                <span className="assist-step-why">{s.why}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="assist-note">
          In the Claude desktop app, say <strong>"set up my brand in Rushhour"</strong>. Keep this
          tab open — Claude builds the map here as it connects.
        </div>

        <div className="assist-foot">
          <a className="assist-open" href="claude://" onClick={close}>
            Open Claude Desktop →
          </a>
          <button className="assist-escape" onClick={dropToManual}>
            Prefer to stay in control? Do it yourself instead →
          </button>
        </div>

        <p className="fork-foot">Same connected map either way — this just changes the method.</p>
      </div>
    </>
  )
}
