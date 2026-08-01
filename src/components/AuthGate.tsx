import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured } from '../lib/supabase'
import { getSession, onAuthChange, signInWithPassword } from '../lib/session'
import { decodeShareToken } from '../lib/shareLink'
import { AuthShell } from './AuthShell'
import { SignUpPage } from './SignUpPage'

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

const SIGNUP_PATH = '/signup'

function atSignupPath(): boolean {
  try {
    return window.location.pathname.replace(/\/+$/, '') === SIGNUP_PATH
  } catch {
    return false
  }
}

/**
 * Keep the address bar honest without pulling in a router: sign-up is a page people link to, so it
 * needs a URL, but the app itself has only one (main.tsx special-cases /changelog the same way).
 * replaceState rather than pushState — the two screens are one form with a toggle, and making Back
 * walk through every switch would be a worse Back button than no history at all.
 */
function setPath(path: string): void {
  try {
    if (window.location.pathname.replace(/\/+$/, '') !== path.replace(/\/+$/, '')) {
      window.history.replaceState(null, '', path + window.location.search)
    }
  } catch {
    /* ignore — the URL is cosmetic, the state below is what decides what renders */
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
  const [mode, setMode] = useState<'in' | 'up'>(() => (atSignupPath() ? 'up' : 'in'))
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

  // Once somebody is in, /signup is a stale address for the app they are now looking at.
  useEffect(() => {
    if (user) setPath('/')
  }, [user])

  const showSignUp = () => {
    setErr('')
    setMode('up')
    setPath(SIGNUP_PATH)
  }
  const showSignIn = () => {
    setErr('')
    setMode('in')
    setPath('/')
  }

  // No backend configured → run as before, no auth.
  if (!isSupabaseConfigured) return <>{children}</>
  // A valid share link grants access without an account — don't wall it behind sign-in.
  if (hasValidShareLink()) return <>{children}</>
  if (user === undefined) return <div className="auth-loading">Connecting…</div>
  if (user) return <>{children}</>

  if (mode === 'up') return <SignUpPage onSignIn={showSignIn} />

  const submit = async () => {
    if (!email.trim() || !pw) return
    setBusy(true)
    setErr('')
    const e = await signInWithPassword(email.trim(), pw)
    if (e) setErr(e)
    setBusy(false)
  }

  return (
    <AuthShell>
      <div className="auth-card">
        <div className="auth-title">Sign in</div>
        <input
          className="auth-input"
          type="email"
          autoComplete="email"
          placeholder="you@agency.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="auth-input"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {err && <div className="auth-err">{err}</div>}
        <button className="btn primary auth-submit" disabled={busy} onClick={submit}>
          {busy ? '…' : 'Sign in'}
        </button>
        <div className="auth-or">
          <span>new here?</span>
        </div>
        <button className="btn auth-create" type="button" onClick={showSignUp}>
          Create an account
        </button>
      </div>
    </AuthShell>
  )
}
