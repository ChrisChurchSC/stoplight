import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured } from '../lib/supabase'
import { getSession, onAuthChange, signInWithPassword, signUpWithPassword } from '../lib/session'
import { decodeShareToken } from '../lib/shareLink'
import { Wordmark } from './Wordmark'

// A valid ?share= link is a self-contained grant (client + role live in the token), so a
// recipient needs no account — the store reads it on load and pins the shared role. Without
// this, an auth-configured deploy would wall share links behind sign-in and they'd open nothing.
function hasValidShareLink(): boolean {
  try {
    const token = new URLSearchParams(window.location.search).get('share')
    return !!(token && decodeShareToken(token))
  } catch {
    return false
  }
}

/**
 * Gates the app behind Supabase auth — but only when a backend is configured.
 * With no VITE_SUPABASE_* set, this is a pass-through and the app runs
 * unauthenticated on localStorage exactly as before. When configured, a session
 * is required; the workspace is created on first sign-in (see lib/session).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined) // undefined = still loading
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    getSession().then((s) => mounted && setUser(s?.user ?? null))
    const off = onAuthChange((u) => setUser(u))
    return () => {
      mounted = false
      off()
    }
  }, [])

  // No backend configured → run as before, no auth.
  if (!isSupabaseConfigured) return <>{children}</>
  // A valid share link grants access without an account — don't wall it behind sign-in.
  if (hasValidShareLink()) return <>{children}</>
  if (user === undefined) return <div className="auth-loading">Connecting…</div>
  if (user) return <>{children}</>

  const submit = async () => {
    if (!email.trim() || !pw) return
    setBusy(true)
    setErr('')
    const fn = mode === 'in' ? signInWithPassword : signUpWithPassword
    const e = await fn(email.trim(), pw)
    if (e) setErr(e)
    if (mode === 'up' && !e) setErr('Check your email to confirm, then sign in.')
    setBusy(false)
  }

  return (
    <div className="auth-gate">
      <a className="auth-changelog" href="/changelog">What&rsquo;s new</a>
      <div className="auth-center">
        <div className="auth-card">
        <div className="auth-title">{mode === 'in' ? 'Sign in' : 'Create your account'}</div>
        <input
          className="auth-input"
          type="email"
          placeholder="you@agency.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="auth-input"
          type="password"
          placeholder="Password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {err && <div className="auth-err">{err}</div>}
        <button className="btn primary auth-submit" disabled={busy} onClick={submit}>
          {busy ? '…' : mode === 'in' ? 'Sign in' : 'Sign up'}
        </button>
        <button className="auth-switch" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </button>
        </div>
      </div>
      <div className="auth-footer">
        <p className="auth-kicker">Marketing infrastructure<br />and automation platform</p>
        <p className="auth-tagline">Leave a trail worth following. Breadcrumbs turns one brand strategy into personalized campaigns for every audience and channel.</p>
        <Wordmark className="auth-bottomlogo" />
      </div>
    </div>
  )
}
