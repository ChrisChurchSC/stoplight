import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD } from '../signup'
import { isNewPasswordValid, validateNewPassword, validateResetRequest } from '../passwordReset'

describe('validateResetRequest', () => {
  it('accepts an ordinary address', () => {
    expect(validateResetRequest('ada@example.com')).toBeNull()
  })

  it('trims before judging, so a pasted address with spaces still passes', () => {
    expect(validateResetRequest('  ada@example.com  ')).toBeNull()
  })

  it('asks for an address when the field is empty or only whitespace', () => {
    expect(validateResetRequest('')).toBe('An email address is required.')
    expect(validateResetRequest('   ')).toBe('An email address is required.')
  })

  it('rejects the shapes that are certainly wrong', () => {
    for (const bad of ['ada', 'ada@', '@example.com', 'ada@example']) {
      expect(validateResetRequest(bad)).toBe('That does not look like an email address.')
    }
  })
})

describe('validateNewPassword', () => {
  it('accepts a long enough password that matches its confirmation', () => {
    expect(validateNewPassword('correct-horse', 'correct-horse')).toEqual({})
    expect(isNewPasswordValid('correct-horse', 'correct-horse')).toBe(true)
  })

  it('holds the same floor as sign-up rather than a second opinion about it', () => {
    const short = 'a'.repeat(MIN_PASSWORD - 1)
    expect(validateNewPassword(short, short).password).toBe(`At least ${MIN_PASSWORD} characters.`)

    const exact = 'a'.repeat(MIN_PASSWORD)
    expect(validateNewPassword(exact, exact)).toEqual({})
  })

  it('requires a password at all', () => {
    expect(validateNewPassword('', '').password).toBe('A password is required.')
  })

  it('reports a mismatch once the password itself is acceptable', () => {
    expect(validateNewPassword('correct-horse', 'correct-hors')).toEqual({
      confirm: 'Both passwords need to match.',
    })
  })

  it('reports only the length when the password is too short, not the mismatch as well', () => {
    const errors = validateNewPassword('short', 'something-else-entirely')
    expect(errors.password).toBe(`At least ${MIN_PASSWORD} characters.`)
    expect(errors.confirm).toBeUndefined()
  })
})
