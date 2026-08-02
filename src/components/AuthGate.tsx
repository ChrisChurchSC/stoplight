import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  getSession,
  onAuthChange,
  sendPasswordReset,
  signInWithPassword,
  updatePassword,
} from '../lib/session'
import { MIN_PASSWORD } from '../domain/signup'
import {
  isNewPasswordValid,
  validateNewPassword,
  validateResetRequest,
  type NewPasswordErrors,
} from '../domain/passwordReset'
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
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>(() => (atSignupPath() ? 'up' : 'in'))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // The reset link was followed. Held separately from `mode` because it is not a screen anyone
  // navigates to — it is a fact about how this session started, and it outranks having a user.
  const [recovering, setRecovering] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwErrors, setPwErrors] = useState<NewPasswordErrors>({})

  useEffect(() => {
    let mounted = true
    getSession().then((s) => mounted && setUser(s?.user ?? null))
    const off = onAuthChange((u, event) => {
      setUser(u)
      // Fires once, when supabase-js finds the recovery token in the URL. Latching it means a
      // later token refresh mid-form does not drop someone out of the password field.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => {
      mounted = false
      off()
    }
  }, [])

  // Once somebody is in, /signup is a stale address for the app they are now looking at. Not while
  // recovering: the URL still carries the token supabase-js is reading, and rewriting the path out
  // from under it is how the recovery session gets lost between render and event.
  useEffect(() => {
    if (user && !recovering) setPath('/')
  }, [user, recovering])

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
  const showForgot = () => {
    setErr('')
    setSentTo('')
    setMode('forgot')
  }

  /**
   * The result is deliberately not shown. Supabase will happily tell us that an address has no
   * account, and repeating that on a signed-out form turns it into a way of asking whether someone
   * has one — so the screen says the same thing either way, and only a transport failure surfaces.
   */
  const requestReset = async () => {
    const problem = validateResetRequest(email)
    if (problem) {
      setErr(problem)
      return
    }
    setBusy(true)
    setErr('')
    await sendPasswordReset(email.trim())
    setSentTo(email.trim())
    setBusy(false)
  }

  const applyNewPassword = async () => {
    const errors = validateNewPassword(newPw, confirmPw)
    setPwErrors(errors)
    if (!isNewPasswordValid(newPw, confirmPw)) return
    setBusy(true)
    setErr('')
    const e = await updatePassword(newPw)
    setBusy(false)
    if (e) {
      setErr(e)
      return
    }
    // A recovery session is a real session, so there is nothing left to sign into. Dropping the
    // latch hands the same user straight to the app, and the token comes off the URL with it.
    setNewPw('')
    setConfirmPw('')
    setRecovering(false)
    try {
      window.history.replaceState(null, '', '/')
    } catch {
      /* the URL is cosmetic; the session is what matters */
    }
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
  /**
   * ABOVE the `user` gate, and that ordering is the whole feature. Following a reset link signs you
   * in — supabase-js reads the token and establishes a session — so a gate that asks only "is there
   * a user" would show the app to someone who arrived to type a new password, with no way back to
   * the field they came for.
   */
  if (recovering)
    return (
      <AuthShell>
        <form
          className="auth-card"
          onSubmit={(e) => {
            e.preventDefault()
            void applyNewPassword()
          }}
        >
          <h1 className="auth-title">Choose a new password</h1>
          <label className="auth-label" htmlFor="auth-newpw">
            New password
          </label>
          <div className="signup-pw">
            <input
              id="auth-newpw"
              className="auth-input"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={`At least ${MIN_PASSWORD} characters`}
              value={newPw}
              aria-invalid={!!pwErrors.password}
              onChange={(e) => setNewPw(e.target.value)}
            />
            <button
              type="button"
              className="signup-pw-toggle"
              onClick={() => setShowPw((v) => !v)}
              aria-pressed={showPw}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
          {pwErrors.password && (
            <div className="auth-err" role="alert">
              {pwErrors.password}
            </div>
          )}
          <label className="auth-label" htmlFor="auth-newpw2">
            Confirm password
          </label>
          <input
            id="auth-newpw2"
            className="auth-input"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirmPw}
            aria-invalid={!!pwErrors.confirm}
            onChange={(e) => setConfirmPw(e.target.value)}
          />
          {pwErrors.confirm && (
            <div className="auth-err" role="alert">
              {pwErrors.confirm}
            </div>
          )}
          {err && (
            <div className="auth-err" role="alert">
              {err}
            </div>
          )}
          <button className="btn primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'One moment…' : 'Set password and continue'}
          </button>
        </form>
      </AuthShell>
    )

  if (user) return <>{children}</>

  if (mode === 'up') return <SignUpPage onSignIn={showSignIn} />

  if (mode === 'forgot')
    return (
      <AuthShell>
        {sentTo ? (
          <div className="auth-card">
            <div className="auth-title">Check your email</div>
            <p className="signup-sent">
              If <strong>{sentTo}</strong> has an account, a link to set a new password is on its
              way. Open it and you can choose one.
            </p>
            <p className="signup-note">Nothing arrived? It can take a minute, and it may be in spam.</p>
            <button className="btn primary auth-submit" type="button" onClick={showSignIn}>
              Back to sign in
            </button>
          </div>
        ) : (
          <form
            className="auth-card"
            onSubmit={(e) => {
              e.preventDefault()
              void requestReset()
            }}
          >
            <h1 className="auth-title">Reset your password</h1>
            <p className="signup-note">
              Tell us the address on the account and we will send a link to set a new password.
            </p>
            <label className="auth-label" htmlFor="auth-reset-email">
              Email
            </label>
            <input
              id="auth-reset-email"
              className="auth-input"
              type="email"
              autoComplete="email"
              placeholder="you@agency.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {err && (
              <div className="auth-err" role="alert">
                {err}
              </div>
            )}
            <button className="btn primary auth-submit" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send the link'}
            </button>
            <button className="auth-switch" type="button" onClick={showSignIn}>
              Back to sign in
            </button>
          </form>
        )}
      </AuthShell>
    )

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
        {/* A button, not a link: unlike sign-up this has no address of its own to be opened in a
            tab or linked to, and dressing it as a link would promise one. */}
        <button className="auth-switch" type="button" onClick={showForgot}>
          Forgot your password?
        </button>
        <a className="auth-switch" href={SIGNUP_PATH} onClick={goSignUp}>
          Need an account? Sign up
        </a>
      </form>
    </AuthShell>
  )
}
