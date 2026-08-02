import { describe, expect, it } from 'vitest'
import {
  EMPTY_SIGNUP_FORM,
  MIN_PASSWORD,
  fullNameOf,
  isSignUpValid,
  passwordStrength,
  validateSignUp,
  workspaceNameOf,
  type SignUpForm,
} from '../signup'

/**
 * THE RULES THAT DECIDE WHETHER AN ACCOUNT CAN BE CREATED.
 *
 * These matter more than most validation because of what happens immediately after a successful
 * sign-up: Supabase emails a confirmation link, and the next time the person appears they sign in
 * with the password they set here. There is no "review your details" step in between. A mistyped
 * password is therefore not a form error, it is a locked account — which is the whole reason the
 * confirm field exists and the whole reason it is checked before the request goes out.
 *
 * The other half is what is NOT required. Last name, role and detail level are optional on purpose
 * (userPrefs treats null as the full UI), and a test that quietly started demanding them would be
 * pinning the opposite of the intent.
 */

const form = (over: Partial<SignUpForm> = {}): SignUpForm => ({
  ...EMPTY_SIGNUP_FORM,
  firstName: 'Ada',
  email: 'ada@initech.com',
  password: 'correct-horse',
  confirm: 'correct-horse',
  company: 'Initech',
  ...over,
})

describe('validateSignUp', () => {
  it('accepts the minimum a person actually has to give', () => {
    expect(validateSignUp(form())).toEqual({})
    expect(isSignUpValid(form())).toBe(true)
  })

  it('does not require a last name or a role', () => {
    expect(isSignUpValid(form({ lastName: '', role: null }))).toBe(true)
  })

  it('requires a first name that is not just spaces', () => {
    expect(validateSignUp(form({ firstName: '   ' })).firstName).toBeTruthy()
  })

  it('rejects an address with no @ or no domain dot', () => {
    expect(validateSignUp(form({ email: 'ada' })).email).toBeTruthy()
    expect(validateSignUp(form({ email: 'ada@initech' })).email).toBeTruthy()
  })

  it('ignores whitespace around a pasted email', () => {
    expect(validateSignUp(form({ email: '  ada@initech.com  ' })).email).toBeUndefined()
  })

  it('holds the password floor above Supabase default of six', () => {
    const short = 'a'.repeat(MIN_PASSWORD - 1)
    expect(MIN_PASSWORD).toBeGreaterThan(6)
    expect(validateSignUp(form({ password: short, confirm: short })).password).toBeTruthy()
  })

  it('catches a mistyped confirmation — the error this form exists for', () => {
    expect(validateSignUp(form({ confirm: 'correct-hose' })).confirm).toBeTruthy()
    expect(isSignUpValid(form({ confirm: '' }))).toBe(false)
  })

  it('reports one problem, not two, when the password is too short to confirm', () => {
    const errors = validateSignUp(form({ password: 'short', confirm: '' }))
    expect(errors.password).toBeTruthy()
    expect(errors.confirm).toBeUndefined()
  })

  it('refuses a password that is just the email address', () => {
    expect(validateSignUp(form({ password: 'ADA@initech.com', confirm: 'ADA@initech.com' })).password).toBeTruthy()
  })

  it('requires a company, because it is what names the workspace', () => {
    expect(validateSignUp(form({ company: '  ' })).company).toBeTruthy()
  })
})

describe('fullNameOf', () => {
  it('joins the two halves', () => {
    expect(fullNameOf(form({ firstName: 'Ada', lastName: 'Lovelace' }))).toBe('Ada Lovelace')
  })

  it('a missing last name is not a trailing space', () => {
    expect(fullNameOf(form({ firstName: ' Ada ', lastName: '' }))).toBe('Ada')
  })
})

describe('workspaceNameOf', () => {
  it('is the company as typed', () => {
    expect(workspaceNameOf(form({ company: '  Initech ' }))).toBe('Initech')
  })

  it('never comes back blank, even though the form would not allow it', () => {
    expect(workspaceNameOf(form({ company: '', firstName: 'Ada' }))).toBe("Ada's workspace")
    expect(workspaceNameOf(form({ company: '', firstName: '' }))).toBe('My workspace')
  })
})

describe('passwordStrength', () => {
  it('says nothing about an empty box', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: '' })
  })

  it('scores anything under the minimum as unusable', () => {
    expect(passwordStrength('abc').score).toBe(0)
  })

  it('rates a long, varied password above a plain one of legal length', () => {
    expect(passwordStrength('Tr0ub4dor&3xplan@tion').score).toBeGreaterThan(
      passwordStrength('password').score,
    )
  })

  it('never scores an accepted password as unusable', () => {
    expect(passwordStrength('a'.repeat(MIN_PASSWORD)).score).toBeGreaterThan(0)
  })
})
