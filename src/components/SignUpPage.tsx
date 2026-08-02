import { useId, useMemo, useState } from 'react'
import { AuthShell } from './AuthShell'
import { MARKETER_ROLES, SKILL_LEVELS } from '../domain/userPrefs'
import {
  EMPTY_SIGNUP_FORM,
  MIN_PASSWORD,
  fullNameOf,
  isSignUpValid,
  passwordStrength,
  validateSignUp,
  workspaceNameOf,
  type SignUpField,
  type SignUpForm,
} from '../domain/signup'
import { signUpWithPassword } from '../lib/session'
import { saveAccount } from '../lib/account'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Creating an account: everything needed to make a person, and a workspace for them to work in.
 *
 * The old sign-up was the sign-in card with a different button, so it collected an email and a
 * password and nothing else. That is enough to authenticate somebody and not enough to know who
 * they are — which is why the account menu had a name hard-coded into it, Settings opened blank,
 * and the first workspace was called "chris's workspace" after the front of an email address.
 *
 * So every field here has somewhere it lands:
 *   name      → user_metadata.full_name (greetings, via firstNameOf) + the local profile Settings reads
 *   email     → the account, and the confirmation link
 *   password  → the account, asked twice because a typo here is unrecoverable
 *   company   → names the workspace created on first sign-in
 *   role      → userPrefs.marketerRole — which objects and vocabulary lead
 *   level     → userPrefs.skillLevel — how much of each screen shows
 *
 * The last two are optional and say so. Null means the full UI, so skipping them costs nothing,
 * and a form that demands an answer to a question about yourself before it will let you in is a
 * worse first impression than one that admits the answer can wait.
 */
export function SignUpPage({ onSignIn }: { onSignIn: () => void }) {
  const [form, setForm] = useState<SignUpForm>(EMPTY_SIGNUP_FORM)
  const [touched, setTouched] = useState<Partial<Record<SignUpField, boolean>>>({})
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverErr, setServerErr] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [showPw, setShowPw] = useState(false)
  const uid = useId()

  const errors = useMemo(() => validateSignUp(form), [form])
  const strength = passwordStrength(form.password)
  const patch = (next: Partial<SignUpForm>) => setForm((f) => ({ ...f, ...next }))

  // An error appears once you've left a field, or once you've tried to submit — never while you
  // are still typing the first character of an email address into an empty box.
  const shown = (field: SignUpField) => (touched[field] || attempted ? errors[field] : undefined)

  const submit = async () => {
    setAttempted(true)
    if (busy || !isSignUpValid(form)) return
    setBusy(true)
    setServerErr('')

    const email = form.email.trim()
    const res = await signUpWithPassword(email, form.password, {
      fullName: fullNameOf(form),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      company: workspaceNameOf(form),
    })
    if (res.error) {
      setServerErr(res.error)
      setBusy(false)
      return
    }

    // The account exists, so the answers go where the app already reads them. Done here rather
    // than on first render of the app because with email confirmation on, "first render of the
    // app" is a different session days later, and possibly never.
    saveAccount({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), email })
    if (form.role || form.skillLevel) {
      useTrafficStore.getState().setUserPrefs({
        ...(form.role ? { marketerRole: form.role } : {}),
        ...(form.skillLevel ? { skillLevel: form.skillLevel } : {}),
      })
    }

    // With confirmation off, a session already exists and AuthGate has swapped this page for the
    // app — there is nothing left to say. With it on, this screen is all the person gets.
    if (res.needsConfirmation) setSentTo(email)
    setBusy(false)
  }

  if (sentTo) {
    return (
      <AuthShell footer={false}>
        <div className="auth-card">
          <div className="auth-title">Check your email</div>
          <p className="signup-sent">
            We sent a confirmation link to <strong>{sentTo}</strong>. Open it to finish creating your
            account, then sign in.
          </p>
          <p className="signup-note">
            Nothing arrived? It can take a minute, and it may be in spam.
          </p>
          <button className="btn primary auth-submit" type="button" onClick={onSignIn}>
            Back to sign in
          </button>
        </div>
      </AuthShell>
    )
  }

  const field = (
    name: SignUpField,
    label: string,
    input: (props: { id: string; invalid: boolean; describedBy?: string }) => React.ReactNode,
  ) => {
    const err = shown(name)
    const id = `${uid}-${name}`
    const errId = `${id}-err`
    return (
      <div className="library-field">
        <label className="library-field-label" htmlFor={id}>
          {label}
        </label>
        {input({ id, invalid: !!err, describedBy: err ? errId : undefined })}
        {err && (
          <div className="signup-err" id={errId}>
            {err}
          </div>
        )}
      </div>
    )
  }

  return (
    <AuthShell roomy footer={false}>
      <form
        className="auth-card signup-card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="auth-title">Create your account</div>
        <p className="signup-sub">A few details and your workspace is ready.</p>

        <div className="signup-row">
          {field('firstName', 'First name', ({ id, invalid, describedBy }) => (
            <input
              id={id}
              className="library-input"
              autoComplete="given-name"
              placeholder="Ada"
              value={form.firstName}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => patch({ firstName: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, firstName: true }))}
            />
          ))}
          <div className="library-field">
            <label className="library-field-label" htmlFor={`${uid}-lastName`}>
              Last name <span className="signup-optional">optional</span>
            </label>
            <input
              id={`${uid}-lastName`}
              className="library-input"
              autoComplete="family-name"
              placeholder="Lovelace"
              value={form.lastName}
              onChange={(e) => patch({ lastName: e.target.value })}
            />
          </div>
        </div>

        {field('email', 'Work email', ({ id, invalid, describedBy }) => (
          <input
            id={id}
            className="library-input"
            type="email"
            autoComplete="email"
            placeholder="you@agency.com"
            value={form.email}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(e) => patch({ email: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          />
        ))}

        {field('company', 'Company or team', ({ id, invalid, describedBy }) => (
          <input
            id={id}
            className="library-input"
            autoComplete="organization"
            placeholder="Initech"
            value={form.company}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(e) => patch({ company: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, company: true }))}
          />
        ))}
        <div className="signup-hint">
          This names your workspace. You can invite the rest of your team once you are in.
        </div>

        {field('password', 'Password', ({ id, invalid, describedBy }) => (
          <div className="signup-pw">
            <input
              id={id}
              className="library-input"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={`At least ${MIN_PASSWORD} characters`}
              value={form.password}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => patch({ password: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
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
        ))}
        {form.password && !shown('password') && (
          <div className="signup-strength" aria-live="polite">
            <div className={`signup-meter s${strength.score}`}>
              <span />
            </div>
            <span className="signup-strength-label">{strength.label}</span>
          </div>
        )}

        {field('confirm', 'Confirm password', ({ id, invalid, describedBy }) => (
          <input
            id={id}
            className="library-input"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Type it again"
            value={form.confirm}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(e) => patch({ confirm: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          />
        ))}

        <div className="signup-divider" />

        <div className="library-field">
          <span className="library-field-label">
            What do you work on? <span className="signup-optional">optional</span>
          </span>
          <div className="acct-seg acct-seg-wrap">
            {MARKETER_ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`acct-seg-btn${form.role === r.value ? ' on' : ''}`}
                title={r.hint}
                onClick={() => patch({ role: form.role === r.value ? null : r.value })}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="signup-hint">
            {MARKETER_ROLES.find((r) => r.value === form.role)?.hint ??
              'Sets what leads on each screen. Nothing is ever hidden, and you can change it in Settings.'}
          </div>
        </div>

        <div className="library-field">
          <span className="library-field-label">
            How much detail? <span className="signup-optional">optional</span>
          </span>
          <div className="acct-seg">
            {SKILL_LEVELS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`acct-seg-btn${form.skillLevel === s.value ? ' on' : ''}`}
                title={s.hint}
                onClick={() => patch({ skillLevel: form.skillLevel === s.value ? null : s.value })}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="signup-hint">
            {SKILL_LEVELS.find((s) => s.value === form.skillLevel)?.hint ??
              'Simple starts calmer, Advanced shows every control. Everything stays one click away.'}
          </div>
        </div>

        {serverErr && <div className="auth-err">{serverErr}</div>}

        <button className="btn primary auth-submit" type="submit" disabled={busy}>
          {busy ? '…' : 'Create account'}
        </button>

        <button className="auth-switch" type="button" onClick={onSignIn}>
          Have an account? Sign in
        </button>
      </form>
    </AuthShell>
  )
}
