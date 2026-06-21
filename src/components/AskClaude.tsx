import { useEffect, useRef, useState } from 'react'
import { askClaude } from '../adapters/ask/claudeAsk'
import { buildAskContext, type AskAnswer, type AskIntent } from '../domain/askClaude'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'

const EXAMPLES = [
  'Is this campaign coherent?',
  "What's working best?",
  "What's flagged, and why?",
  'What drove the most revenue?',
]

const INTENT_LABEL: Record<AskIntent, string> = {
  connection: 'Connection',
  'what-worked': 'What worked',
  help: 'Help',
}

/**
 * Ask Claude — a command palette over the two things this tool knows: whether the
 * campaign is coherent (the connection check) and what's driving outcomes
 * (proof-point ROI). The answer is always grounded in real, computed findings;
 * Claude narrates when a key is present, the heuristic answers the same question
 * the same way when it isn't. Answers route into the matching view.
 */
export function AskClaude() {
  const open = useTrafficStore((s) => s.askOpen)
  const close = useTrafficStore((s) => s.closeAsk)
  const rows = useTrafficStore((s) => s.rows)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const comments = useTrafficStore((s) => s.comments)
  const batchReview = useTrafficStore((s) => s.batchReview)
  const icp = useTrafficStore((s) => s.icp)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const openBreaks = useTrafficStore((s) => s.openBreaks)
  const setView = useTrafficStore((s) => s.setView)

  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<(AskAnswer & { live: boolean }) | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  const scope = `${clientFilter === 'all' ? 'All clients' : clientFilter} · ${
    campaignFilter === 'all' ? 'All campaigns' : campaignFilter
  }`

  const dismiss = () => {
    setQ('')
    setAnswer(null)
    setBusy(false)
    close()
  }

  const run = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    setQ(text)
    setBusy(true)
    setAnswer(null)
    const scoped = rows.filter((r) => rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }))
    const ctx = buildAskContext(text, scoped, { scope, breakStatus, comments, batchReview, icp, campaigns: campaignList })
    const res = await askClaude(ctx)
    setAnswer(res)
    setBusy(false)
  }

  const chips =
    answer?.intent === 'connection'
      ? [
          { label: 'View breaks →', go: () => { openBreaks(); dismiss() } },
          { label: 'See on canvas', go: () => { setView('flow'); dismiss() } },
        ]
      : answer?.intent === 'what-worked'
        ? [{ label: 'Open insights →', go: () => { setView('insights'); dismiss() } }]
        : []

  return (
    <>
      <div className="ask-scrim" onClick={dismiss} />
      <div className="ask" role="dialog" aria-label="Ask Claude">
        <div className="ask-bar">
          <span className="ask-spark">✦</span>
          <input
            ref={inputRef}
            className="ask-input"
            placeholder="Ask Claude about this campaign…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') run(q)
              else if (e.key === 'Escape') dismiss()
            }}
          />
          <span className="ask-scope">{scope}</span>
        </div>

        {!answer && !busy && (
          <div className="ask-examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="ask-ex" onClick={() => run(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}

        {busy && <div className="ask-busy">Reading your campaign…</div>}

        {answer && !busy && (
          <div className="ask-answer">
            <div className="ask-answer-head">
              <span className={`ask-intent i-${answer.intent}`}>{INTENT_LABEL[answer.intent]}</span>
              <span className="ask-source">{answer.live ? 'Claude' : 'offline estimate'}</span>
            </div>
            <p className="ask-text">{answer.answer}</p>
            <div className="ask-actions">
              {chips.map((c) => (
                <button key={c.label} className="ask-action" onClick={c.go}>
                  {c.label}
                </button>
              ))}
              <span className="spacer" />
              <button className="ask-again" onClick={() => { setAnswer(null); setQ(''); inputRef.current?.focus() }}>
                Ask another
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
