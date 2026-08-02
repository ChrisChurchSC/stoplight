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
  const goSignUp = (e: React.MouseEvent) => {
    // Leave the deliberate ways of opening a link elsewhere alone — cmd/ctrl/shift click, or the
    // middle button — and only take over the plain one.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    showSignUp()
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
  // On the SAME lilac field as the gate it precedes. This used to be grey text on the app's --bg,
  // so arriving logged-out meant a neutral screen that then swapped wholesale to a purple one —
  // two different pages for what is one wait.
  if (user === undefined)
    return (
      <div className="auth-gate auth-gate-loading">
        <div className="auth-loading">Connecting…</div>
      </div>
    )
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
    // The shell is the splash layout — lilac field, changelog link, kicker/tagline/wordmark footer
    // — extracted so sign-up sits on exactly the same ground instead of a second copy that drifts.
    <AuthShell>
      {/**
       * A REAL FORM, not two inputs and a click handler. As a plain div this could only be
       * submitted from the password field (the one that carried an Enter handler), browsers had
       * nothing to recognise as a login and so never offered to save or fill the credentials, and
       * the button defaulted to type="submit" inside no form at all. A <form onSubmit> gets Enter
       * from either field, password-manager fill, and the button's native role, for free.
       */}
      <form
        className="auth-card"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {/* No longer a two-mode form: sign-up is its own page now, so every label here is fixed. */}
        <h1 className="auth-title">Sign in</h1>
        {/* Labelled, not placeholder-only. A placeholder is not a label: it is gone the moment
            you type, it is not what a screen reader announces as the field's name, and at 2.6:1
            on white it was the lowest-contrast text on the page doing the most important job. */}
        <label className="auth-label" htmlFor="auth-email">
          Email
        </label>
        <input
          id="auth-email"
          className="auth-input"
          type="email"
          autoComplete="email"
          placeholder="you@agency.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="auth-label" htmlFor="auth-pw">
          Password
        </label>
        <input
          id="auth-pw"
          className="auth-input"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        {/* role=alert so the failure is announced rather than only drawn. */}
        {err && (
          <div className="auth-err" role="alert">
            {err}
          </div>
        )}
        <button className="btn primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'One moment…' : 'Sign in'}
        </button>
        {/* A real href, so it reads and behaves as a link — hover target, status bar, middle-click
            to a new tab — while the click handler keeps the switch in-app instead of reloading
            the whole bundle to render a form that is already loaded. */}
        <a className="auth-switch" href={SIGNUP_PATH} onClick={goSignUp}>
          Need an account? Sign up
        </a>
      </form>
    </AuthShell>
  )
}
