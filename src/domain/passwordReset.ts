import { MIN_PASSWORD, isEmailShaped } from './signup'

/**
 * The two forms in the password-reset flow: ask for a link, then choose a new password.
 *
 * Kept beside signup.ts and borrowing its rules rather than restating them. A reset form that
 * accepted a 6-character password would quietly lower the floor sign-up spent effort raising, and
 * the way that happens is someone writing `length < 8` a second time.
 */

/** The "email me a link" form. One field, so one message or nothing. */
export function validateResetRequest(email: string): string | null {
  const trimmed = email.trim()
  if (!trimmed) return 'An email address is required.'
  if (!isEmailShaped(trimmed)) return 'That does not look like an email address.'
  return null
}

export interface NewPasswordErrors {
  password?: string
  confirm?: string
}

/**
 * The "choose a new password" form. Same floor and same confirm-second ordering as sign-up: a
 * password that is too short reports that, and not also that the confirmation does not match it,
 * because being told two things when you have done one thing wrong reads as two problems.
 */
export function validateNewPassword(password: string, confirm: string): NewPasswordErrors {
  const errors: NewPasswordErrors = {}

  if (!password) errors.password = 'A password is required.'
  else if (password.length < MIN_PASSWORD) errors.password = `At least ${MIN_PASSWORD} characters.`

  if (!errors.password && confirm !== password) errors.confirm = 'Both passwords need to match.'

  return errors
}

export function isNewPasswordValid(password: string, confirm: string): boolean {
  return Object.keys(validateNewPassword(password, confirm)).length === 0
}
