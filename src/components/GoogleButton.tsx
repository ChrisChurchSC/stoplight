/**
 * "Continue with Google" — the same button on sign-in and sign-up, because it is the same act.
 *
 * Deliberately not two buttons saying "Sign in with Google" and "Sign up with Google". With OAuth
 * there is no difference to make: the redirect is identical, and which one it turns out to be
 * depends on whether Google's answer matches an existing account — something neither we nor the
 * person clicking knows until it comes back. Labelling it "sign up" on one screen would promise a
 * new account to someone who already has one.
 */

/** Google's mark, inline. Their branding terms require this artwork rather than a lookalike, and
 *  it is four fixed brand colours, so it does not take a theme and must not be recoloured. */
function GoogleMark() {
  return (
    <svg className="auth-google-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

export function GoogleButton({
  onClick,
  busy = false,
  disabled = false,
}: {
  onClick: () => void
  busy?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="auth-google"
      onClick={onClick}
      disabled={busy || disabled}
      // The label never becomes the word "Leaving…" alone: a screen reader user who tabs back to
      // a button whose name has changed out from under them has lost the thing they were on.
      aria-label="Continue with Google"
    >
      <GoogleMark />
      <span>{busy ? 'Taking you to Google…' : 'Continue with Google'}</span>
    </button>
  )
}

/**
 * The "or" rule between the Google button and the email form. A divider rather than a bare gap
 * because the two are alternatives, not steps — without it the button reads as something you do
 * *before* filling in the form.
 */
export function AuthOrDivider() {
  return (
    <div className="auth-or" role="separator" aria-orientation="horizontal">
      <span>or</span>
    </div>
  )
}
