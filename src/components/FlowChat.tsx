import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Markdown } from '../lib/miniMarkdown'
import type { FlowChatMsg, SavedFlowChat } from '../domain/flowAgent'

export type { FlowChatMsg }
export type ChatIntent = 'build' | 'analyze'

const SparkIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
  </svg>
)
const AnalyzeIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" />
  </svg>
)

interface Example { title: string; desc: string; prompt: string; mode?: ChatIntent }
/**
 * A BLANK campaign gets prompts that START one. The build examples below assume a campaign
 * already exists ("add a newsletter", "tag the right records"), which is the wrong offer on an
 * empty canvas, and the old lead example was a Giving Tuesday push: a fundraising burst is a
 * strange default for every brand. These three each produce a whole campaign from nothing and
 * name no industry.
 */
const START_EXAMPLES: Example[] = [
  { title: 'Launch something new', desc: 'A dated push for a product or feature, across the channels you already use.', prompt: 'Build a 6-week launch campaign for a new product across our main channels' },
  { title: 'Start an always-on engine', desc: 'A repeatable monthly cadence: a newsletter, social posts, and articles.', prompt: 'Set up an always-on content engine with a monthly newsletter, 4 social posts a month, and 2 articles a month' },
  { title: 'Run a seasonal push', desc: 'A short burst timed to a date that matters to your audience.', prompt: 'Build a 2-week seasonal campaign timed to a moment that matters to our audience' },
]
const BUILD_EXAMPLES: Example[] = [
  { title: 'Add a newsletter and socials', desc: 'Add a newsletter and 4 Instagram posts a month.', prompt: 'Add a weekly newsletter and 4 Instagram posts a month' },
  { title: 'Tag the right records', desc: 'Point this campaign at the segments it targets.', prompt: 'Tag this campaign to the segments it targets' },
  { title: "What's weak here?", desc: 'An honest read on gaps and overlaps.', prompt: "What's weak about this campaign?", mode: 'analyze' },
]
const VIEW_EXAMPLES: Example[] = [
  { title: 'Regenerate the copy', desc: 'Rewrite every asset so they read distinct and on-brand.', prompt: 'Regenerate the copy for this campaign' },
  { title: 'Add a deliverable', desc: 'Grow the campaign with another channel.', prompt: 'Add a LinkedIn post to this campaign' },
  { title: "What's weak here?", desc: 'An honest read on gaps and overlaps.', prompt: "What's weak about this campaign?", mode: 'analyze' },
]

/**
 * The flow-canvas AI chat panel. Presentational: it renders the conversation, a Build /
 * Analyze mode toggle, example cards, chat history, and the pending-suggestions queue. All
 * actions (send, apply/discard suggestions, new chat, open/delete history) call up to the
 * parent (FlowsView), which owns the agent call + applies the approved commands.
 */
export function FlowChat({
  messages,
  busy,
  flowMode,
  history,
  collapsed,
  blank = false,
  templates = [],
  onTemplate,
  onMoreTemplates,
  onCollapse,
  onSend,
  onApply,
  onDiscard,
  onNewChat,
  onOpenHistory,
  onDeleteHistory,
}: {
  messages: FlowChatMsg[]
  busy: boolean
  flowMode: 'build' | 'view'
  history: SavedFlowChat[]
  collapsed: boolean
  /** The campaign has no shape yet, so this panel IS the front door (see the empty state). */
  blank?: boolean
  /** Quick-start deliverables offered on a blank campaign. Dropping one skips the AI entirely. */
  templates?: { key: string; label: string; node: ReactNode }[]
  onTemplate?: (key: string) => void
  onMoreTemplates?: () => void
  onCollapse: (v: boolean) => void
  onSend: (text: string, intent: ChatIntent) => void
  onApply: (msgId: string) => void
  onDiscard: (msgId: string) => void
  onNewChat: () => void
  onOpenHistory: (id: string) => void
  onDeleteHistory: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [intent, setIntent] = useState<ChatIntent>('build')
  const [histOpen, setHistOpen] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const send = () => {
    const t = q.trim()
    if (!t || busy) return
    setQ('')
    onSend(t, intent)
  }
  const examples = blank ? START_EXAMPLES : flowMode === 'build' ? BUILD_EXAMPLES : VIEW_EXAMPLES

  // Collapsed: Hansel is fully hidden (no rail) — the "Hansel" item in the left nav reopens it.
  if (collapsed) return null

  return (
    <aside className="fchat">
      <header className="fchat-head">
        <span className="fchat-spark" aria-hidden="true">✦</span>
        <span className="fchat-title">Hansel</span>
        <span className="fchat-beta">Beta</span>
        <div className="fchat-head-actions">
          <button className="fchat-hbtn" title="New chat" aria-label="New chat" onClick={() => (messages.length ? setConfirmNew(true) : onNewChat())}>+</button>
          <button className="fchat-hbtn" title="Collapse panel" aria-label="Collapse panel" onClick={() => onCollapse(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M14 9l-2 3 2 3" />
            </svg>
          </button>
          <div className="fchat-hist-wrap">
            <button className="fchat-hbtn" title="Chat history" aria-label="Chat history" onClick={() => setHistOpen((o) => !o)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" />
              </svg>
            </button>
            {histOpen && (
              <>
                <div className="fchat-hist-scrim" onClick={() => setHistOpen(false)} />
                <div className="fchat-hist-menu">
                  <div className="fchat-hist-head">Chat history</div>
                  {history.length === 0 && <div className="fchat-hist-empty">No past chats for this campaign yet.</div>}
                  {history.map((h) => (
                    <div key={h.id} className="fchat-hist-row">
                      <button className="fchat-hist-open" onClick={() => { onOpenHistory(h.id); setHistOpen(false) }}>
                        <span className="fchat-hist-title">{h.title || 'Untitled chat'}</span>
                        <span className="fchat-hist-meta">{h.messages.length} message{h.messages.length === 1 ? '' : 's'}</span>
                      </button>
                      <button className="fchat-hist-del" title="Delete" aria-label="Delete chat" onClick={() => onDeleteHistory(h.id)}>✕</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="fchat-thread" ref={threadRef}>
        {messages.length === 0 && (
          /* On a blank campaign this panel is the ONLY front door: the floating starter card
             that used to ask this question was a second, redundant one, and its submit handler
             just opened this panel and sent the text here anyway. So ask it here, where the
             answer already lives, and keep the composer below as the single input. */
          <div className={`fchat-empty${blank ? ' fchat-empty-blank' : ''}`}>
            {blank ? (
              <>
                <p className="fchat-empty-eyebrow">New campaign</p>
                <p className="fchat-empty-lead">What are you launching?</p>
                <p className="fchat-empty-sub">Describe it below and I&rsquo;ll draft the plan, the audiences, and the copy. Nothing sends until you say so.</p>
              </>
            ) : (
              <>
                <p className="fchat-empty-lead">I&rsquo;m Hansel.</p>
                <p className="fchat-empty-sub">In <strong>Build</strong> I edit this campaign (add deliverables, tag records, set a budget and flight, {flowMode === 'build' ? 'build it' : 'regenerate copy'}). In <strong>Analyze</strong> I answer questions without changing anything.</p>
              </>
            )}
            <div className="fchat-cards">
              {examples.map((ex) => (
                <button key={ex.title} className="fchat-card" disabled={busy} onClick={() => onSend(ex.prompt, ex.mode ?? intent)}>
                  <span className="fchat-card-ic" aria-hidden="true">{ex.mode === 'analyze' ? <AnalyzeIco /> : <SparkIco />}</span>
                  <span className="fchat-card-txt">
                    <span className="fchat-card-title">{ex.title}</span>
                    <span className="fchat-card-desc">{ex.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            {blank && templates.length > 0 && (
              <>
                <div className="fchat-or"><span>or start from a template</span></div>
                <div className="fchat-tmpl">
                  {templates.map((t) => (
                    <button key={t.key} className="fchat-tmpl-chip" disabled={busy} onClick={() => onTemplate?.(t.key)}>
                      {t.node}
                      <span>{t.label}</span>
                    </button>
                  ))}
                  {onMoreTemplates && (
                    <button className="fchat-tmpl-chip fchat-tmpl-more" disabled={busy} onClick={onMoreTemplates}>
                      <span className="fchat-tmpl-more-ic" aria-hidden="true">+</span>
                      <span>More</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="fchat-user">{m.text}</div>
          ) : (
            <div key={m.id} className="fchat-ai">
              <Markdown text={m.text} className="fchat-ai-md" />
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="fchat-sugg-box">
                  {/* Once applied, the list shown is what APPLY REPORTED, not what was proposed.
                      Those differ: the open-campaign path cannot run every op, and it used to drop
                      the rest silently under a check mark. If a batch was applied, m.applied and
                      m.skipped are authoritative; m.suggestions is only the pre-approval preview. */}
                  <div className="fchat-sugg-head">
                    {m.resolved === 'discarded'
                      ? 'Discarded'
                      : m.resolved === 'applied'
                        ? m.skipped && m.skipped.length > 0
                          ? `Applied ${m.applied?.length ?? 0} of ${(m.applied?.length ?? 0) + m.skipped.length}`
                          : 'Applied'
                        : `Suggestions · ${m.suggestions.length}`}
                  </div>
                  <ul className="fchat-sugg-list">
                    {(m.resolved === 'applied' ? (m.applied ?? []) : m.suggestions).map((s, i) => (
                      <li key={i} className={`fchat-sugg-item${m.resolved === 'applied' ? ' done' : ''}`}>
                        <span className="fchat-sugg-check" aria-hidden="true">{m.resolved === 'applied' ? '✓' : '•'}</span>
                        {s}
                      </li>
                    ))}
                    {m.resolved === 'applied' && (m.skipped ?? []).map((s, i) => (
                      <li key={`sk${i}`} className="fchat-sugg-item skipped">
                        <span className="fchat-sugg-check" aria-hidden="true">–</span>
                        {s}
                      </li>
                    ))}
                    {m.resolved === 'applied' && !(m.applied ?? []).length && !(m.skipped ?? []).length && (
                      <li className="fchat-sugg-item skipped">
                        <span className="fchat-sugg-check" aria-hidden="true">–</span>
                        Nothing changed.
                      </li>
                    )}
                  </ul>
                  {!m.resolved && (
                    <div className="fchat-sugg-foot">
                      <button className="fchat-sugg-apply" onClick={() => onApply(m.id)} disabled={busy}>Apply all</button>
                      <button className="fchat-sugg-discard" onClick={() => onDiscard(m.id)} disabled={busy}>Discard</button>
                    </div>
                  )}
                </div>
              )}
              {m.nextSteps && m.nextSteps.length > 0 && (
                <div className="fchat-next">
                  {m.nextSteps.map((s, i) => (
                    <button key={i} className="fchat-next-chip" disabled={busy} onClick={() => onSend(s, 'build')}>{s}</button>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
        {busy && (
          <div className="fchat-ai fchat-thinking">
            <span className="fchat-dot" /><span className="fchat-dot" /><span className="fchat-dot" />
          </div>
        )}
      </div>

      <div className="fchat-disclaim">The assistant can make mistakes. Review its suggestions before applying.</div>
      <div className="fchat-composer">
        <div className="fchat-mode">
          <button className={`fchat-mode-btn${intent === 'build' ? ' on' : ''}`} onClick={() => setIntent('build')}>
            <SparkIco /> Build
          </button>
          <button className={`fchat-mode-btn${intent === 'analyze' ? ' on' : ''}`} onClick={() => setIntent('analyze')}>
            <AnalyzeIco /> Analyze
          </button>
        </div>
        <div className="fchat-inputrow">
          <textarea
            className="fchat-input"
            rows={2}
            value={q}
            /* On a blank campaign there is nothing to "edit" yet, so the composer asks for the
               campaign itself. This is the starter card's old placeholder, which is where the
               example belongs now that this is the only input. */
            placeholder={
              intent === 'analyze'
                ? 'Ask about this campaign…'
                : blank
                  ? 'A spring launch for our new onboarding flow, aimed at RevOps leads…'
                  : 'Describe an edit to make…'
            }
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
          />
          <button className="fchat-send" onClick={send} disabled={busy || !q.trim()} aria-label="Send">↑</button>
        </div>
      </div>

      {confirmNew && (
        <>
          <div className="fchat-modal-scrim" onClick={() => setConfirmNew(false)} />
          <div className="fchat-modal" role="dialog" aria-label="Start new chat">
            <strong className="fchat-modal-title">Start new chat</strong>
            <p className="fchat-modal-text">If you continue, this chat will close and a new chat will start. You can find it later in chat history.</p>
            <div className="fchat-modal-foot">
              <button className="fchat-modal-cancel" onClick={() => setConfirmNew(false)}>Cancel</button>
              <button className="fchat-modal-go" onClick={() => { setConfirmNew(false); onNewChat() }}>Continue</button>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
