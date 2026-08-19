import { useEffect, useRef, useState } from 'react'
import { siClaude } from 'simple-icons'

/**
 * Gretel, handed off.
 *
 * Gretel used to be a chat panel docked beside the canvas: its own thread, its own model call, its
 * own approve-then-apply queue. This replaces all of that with a door. The reasoning is that the
 * app is a bad place to reimplement a chat client — people already have one, with their own
 * history, their own memory, and a far better model budget than a side panel — and Breadcrumbs
 * already exposes what it knows over MCP (mcp/breadcrumbs-server.mjs). So the useful thing to ship
 * is not another chat. It is a well-phrased question and a way out of the app with it.
 *
 * What that costs is stated plainly in docs/claude-desktop-mcp.md: the connector's action set
 * (GRETEL_ACTIONS in lib/agentBridge.ts) is reads plus additive brand records, so an outside agent
 * can ANSWER about a campaign but cannot yet BUILD one the way Build mode did.
 */

// simple-icons dropped OpenAI's mark, same as LinkedIn's in ChannelIcon.tsx, so supply it.
const OPENAI_PATH =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z'

const BrandMark = ({ path }: { path: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={path} />
  </svg>
)

/**
 * The prefill deep links. Both apps read the first message off `?q=`, so the starter question is
 * already typed when the tab opens — the point of the whole dialog is that you do not retype it.
 */
const openWith = (base: string, question: string) => {
  window.open(`${base}${encodeURIComponent(question)}`, '_blank', 'noopener,noreferrer')
}

/**
 * The config Claude Desktop needs. Kept here rather than only in docs/ because the moment someone
 * needs it is the moment they click "Set it up", and sending them to a markdown file in the repo
 * to find four lines of JSON is how a setup step gets abandoned.
 */
const CONFIG_SNIPPET = `{
  "mcpServers": {
    "breadcrumbs": {
      "command": "node",
      "args": ["<path-to-repo>/mcp/breadcrumbs-server.mjs"]
    }
  }
}`

export function GretelHandoff({
  open,
  onClose,
  questions,
}: {
  open: boolean
  onClose: () => void
  /** Starter questions for what is on screen, best first. Never empty — see starterQuestions(). */
  questions: string[]
}) {
  const [i, setI] = useState(0)
  const [setup, setSetup] = useState(false)
  const [copied, setCopied] = useState<'question' | 'config' | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Reopening should not resume where the last visit left off: a stale question for a campaign you
  // have since edited is worse than the top one, and landing back on the setup panel hides the
  // buttons the dialog exists for.
  useEffect(() => {
    if (open) {
      setI(0)
      setSetup(false)
      setCopied(null)
      dialogRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const question = questions[i % questions.length] ?? ''
  const copy = async (what: 'question' | 'config', text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 1600)
    } catch {
      /* Clipboard denied (or no permission in this context) — the text is on screen to select. */
    }
  }

  return (
    <>
      <div className="gh-scrim" onClick={onClose} />
      <div className="gh-modal" role="dialog" aria-modal="true" aria-label="Ask your data anything" tabIndex={-1} ref={dialogRef}>
        <button className="gh-close" onClick={onClose} title="Close" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        {setup ? (
          <>
            <h2 className="gh-title">Connect your agent</h2>
            <p className="gh-sub">
              Breadcrumbs speaks MCP. Point Claude Desktop at the connector once and it can read this
              workspace — your brand, campaigns, and assets — in every chat after that.
            </p>
            <ol className="gh-steps">
              <li>Run Breadcrumbs locally (<code>npm run dev</code>) and leave a tab open. The connector talks to that tab.</li>
              <li>Open Claude Desktop → Settings → Developer → Edit Config.</li>
              <li>Add the block below, using this repo&rsquo;s real path, then restart Claude Desktop.</li>
            </ol>
            <pre className="gh-code">{CONFIG_SNIPPET}</pre>
            <div className="gh-actions">
              <button className="gh-btn" onClick={() => copy('config', CONFIG_SNIPPET)}>
                {copied === 'config' ? 'Copied' : 'Copy config'}
              </button>
            </div>
            <p className="gh-foot">
              Full walkthrough in <code>docs/claude-desktop-mcp.md</code>
              {' · '}
              <button className="gh-link" onClick={() => setSetup(false)}>Back</button>
            </p>
          </>
        ) : (
          <>
            <h2 className="gh-title">Ask your data anything</h2>
            <p className="gh-sub">
              Start a chat with your AI agent — the Breadcrumbs connector lets it read your brand,
              campaigns, and assets, and answer your questions.
            </p>

            <div className="gh-question">
              <div className="gh-question-head">
                <span className="gh-eyebrow">Starter question</span>
                {questions.length > 1 && (
                  <button className="gh-shuffle" onClick={() => setI((n) => n + 1)} title="Another question" aria-label="Another question">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 4v4h-4" />
                    </svg>
                  </button>
                )}
              </div>
              <p className="gh-question-text">{question}</p>
            </div>

            <div className="gh-actions">
              <button className="gh-go" onClick={() => openWith('https://claude.ai/new?q=', question)}>
                <span className="gh-go-ic"><BrandMark path={siClaude.path} /></span>
                Open in Claude
              </button>
              <button className="gh-go" onClick={() => openWith('https://chatgpt.com/?q=', question)}>
                <span className="gh-go-ic"><BrandMark path={OPENAI_PATH} /></span>
                Open in ChatGPT
              </button>
              {/* Some agents live nowhere with a URL. Copying is the escape hatch that always works. */}
              <button className="gh-copy" onClick={() => copy('question', question)}>
                {copied === 'question' ? 'Copied' : 'Copy question'}
              </button>
            </div>

            <p className="gh-foot">
              Agent not connected yet?{' '}
              <button className="gh-link" onClick={() => setSetup(true)}>Set it up →</button>
            </p>
          </>
        )}
      </div>
    </>
  )
}
