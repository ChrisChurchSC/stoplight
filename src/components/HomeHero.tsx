import { useEffect, useMemo, useRef, useState } from 'react'
import { firstNameOf, getSession, onAuthChange } from '../lib/session'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The home landing hero: a greeting, a link back to your last report, and an
 * "Ask anything" box that opens the grounded Ask Claude palette pre-filled with
 * whatever you type (or the quick-action chip you pick). It is a front door onto
 * the same askClaude flow the rest of the app uses, not a second chat engine.
 */

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const CHIPS: { icon: string; label: string; seed: string }[] = [
  { icon: '🚩', label: 'What needs attention?', seed: "What's flagged across my campaigns, and why?" },
  { icon: '📈', label: "What's working best?", seed: "What's working best right now?" },
  { icon: '🧭', label: 'What should I prioritize?', seed: 'What should I prioritize this week?' },
]

export function HomeHero() {
  const openHomeChat = useTrafficStore((s) => s.openHomeChat)
  const reports = useTrafficStore((s) => s.reports)
  const setPage = useTrafficStore((s) => s.setPage)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Greet the signed-in user by name; keep it in sync if they sign in/out.
  useEffect(() => {
    let live = true
    void getSession().then((s) => live && setName(firstNameOf(s?.user ?? null)))
    const off = onAuthChange((u) => setName(firstNameOf(u)))
    return () => {
      live = false
      off()
    }
  }, [])

  const recent = useMemo(() => [...reports].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null, [reports])

  const submit = () => {
    const text = q.trim()
    if (!text) return
    openHomeChat(text)
    setQ('')
  }

  return (
    <section className="hh">
      <h1 className="hh-greeting">
        {greeting()}
        {name ? `, ${name}` : ''}.
      </h1>

      {recent && (
        <button
          className="hh-recent"
          onClick={() => {
            setClientFilter(recent.client)
            setPage('reports')
          }}
          title="Open your last report"
        >
          <span className="hh-recent-ic" aria-hidden="true">
            ↺
          </span>
          <span className="hh-recent-label">Recent chat</span>
          <span className="hh-recent-dot">·</span>
          <span className="hh-recent-title">{recent.title}</span>
        </button>
      )}

      <div className="hh-box">
        <textarea
          ref={taRef}
          className="hh-input"
          placeholder="Ask anything…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={3}
        />
        <div className="hh-box-foot">
          <span className="hh-model" title="Model is chosen automatically">
            Auto
          </span>
          <button className="hh-send" onClick={submit} disabled={!q.trim()} aria-label="Ask">
            ↑
          </button>
        </div>
      </div>

      <div className="hh-chips">
        {CHIPS.map((c) => (
          <button key={c.label} className="hh-chip" onClick={() => openHomeChat(c.seed)}>
            <span className="hh-chip-ic" aria-hidden="true">
              {c.icon}
            </span>
            {c.label}
          </button>
        ))}
      </div>
    </section>
  )
}
