import type { MarketerRole } from './userPrefs'

/**
 * The sign-up form: what has to be true before an account can be created, kept as pure functions so
 * the rules are testable without a browser or a Supabase project.
 *
 * Why validate here at all, when Supabase validates too? Because Supabase only knows about the two
 * fields it stores. It cannot tell you that the two password boxes disagree, it accepts a six
 * character password by default, and its errors arrive after a round trip — by which point a typo in
 * the password is unrecoverable, since the next thing that happens is a confirmation email and a
 * sign-in with a password the person never meant to set.
 *
 * Required: first name, email, password (twice), company. Optional by design: last name (not
 * everyone has one), and role — null means the neutral, full UI, so a skipped question is never
 * worse than an unasked one (see userPrefs.ts). Skill level is not asked here at all; it is a
 * question about a UI nobody has seen yet, so it waits for Settings.
 */

export interface SignUpForm {
  firstName: string
  lastName: string
  email: string
  password: string
  confirm: string
  /** Names the workspace created on first sign-in, instead of the email's local part. */
  company: string
  role: MarketerRole | null
}

export const EMPTY_SIGNUP_FORM: SignUpForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirm: '',
  company: '',
  role: null,
}

/** Only the fields that can fail. Optional ones are absent on purpose. */
export type SignUpField = 'firstName' | 'email' | 'password' | 'confirm' | 'company'
export type SignUpErrors = Partial<Record<SignUpField, string>>

/** Our floor, deliberately above Supabase's default minimum of 6. */
export const MIN_PASSWORD = 8

// Deliberately loose: the confirmation email is the real test of an address. This only catches the
// shapes that are certainly wrong (no @, no dot in the domain, stray whitespace from a paste).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Exported because password reset asks the same question of the same kind of field, and two
 * regexes for "is this an address" is how sign-up and reset end up disagreeing about one.
 */
export function isEmailShaped(email: string): boolean {
  return EMAIL_RE.test(email)
}

export function validateSignUp(form: SignUpForm): SignUpErrors {
  const errors: SignUpErrors = {}
  const email = form.email.trim()

  if (!form.firstName.trim()) errors.firstName = 'Tell us what to call you.'

  if (!email) errors.email = 'An email address is required.'
  else if (!isEmailShaped(email)) errors.email = 'That does not look like an email address.'

  if (!form.password) errors.password = 'A password is required.'
  else if (form.password.length < MIN_PASSWORD) errors.password = `At least ${MIN_PASSWORD} characters.`
  else if (email && form.password.toLowerCase() === email.toLowerCase())
    errors.password = 'Your password cannot be your email address.'

  // Only worth asking about once the password itself is worth confirming, so a short password
  // reports one problem rather than two.
  if (!errors.password && form.confirm !== form.password) errors.confirm = 'Both passwords need to match.'

  if (!form.company.trim()) errors.company = 'A company or team name — it names your workspace.'

  return errors
}

export function isSignUpValid(form: SignUpForm): boolean {
  return Object.keys(validateSignUp(form)).length === 0
}

/** "Ada" + "Lovelace" → "Ada Lovelace"; a missing last name is not a trailing space. */
export function fullNameOf(form: SignUpForm): string {
  return [form.firstName, form.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
}

/** What the workspace gets called. Falls back to the person, so it is never blank. */
export function workspaceNameOf(form: SignUpForm): string {
  const company = form.company.trim()
  if (company) return company
  const first = form.firstName.trim()
  return first ? `${first}'s workspace` : 'My workspace'
}

export interface PasswordStrength {
  /** 0 = unusable (empty or too short), 1–4 = weak → strong. */
  score: 0 | 1 | 2 | 3 | 4
  label: string
}

/**
 * Advisory only — anything at or above MIN_PASSWORD is accepted. This tells someone their password
 * is weak; it does not make the choice for them, because a rule that demands a symbol mostly
 * produces the same password with a "!" on the end.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '' }
  if (password.length < MIN_PASSWORD) return { score: 0, label: 'Too short' }

  let points = 0
  if (password.length >= 12) points += 1
  if (password.length >= 16) points += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1
  if (/\d/.test(password)) points += 1
  if (/[^A-Za-z0-9]/.test(password)) points += 1

  const score = Math.min(4, Math.max(1, points)) as 1 | 2 | 3 | 4
  return { score, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score] }
}
