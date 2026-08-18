import { describe, expect, it } from 'vitest'
import {
  MAX_WORKSPACE_NAME,
  isWorkspaceNameValid,
  needsWorkspaceName,
  suggestCompanyFromEmail,
  validateWorkspaceName,
} from '../workspaceNaming'

/**
 * WHAT A GOOGLE ACCOUNT'S WORKSPACE ENDS UP CALLED.
 *
 * The stakes here are unusual for naming logic: nothing in the app can rename a workspace. The
 * `workspaces` table is written in exactly one file (lib/session.ts) and there is no settings
 * screen for it, so whatever a workspace is called on the first sign-in is what the team reads
 * forever. That is why a fallback name was not good enough and this question gets a screen.
 *
 * The two halves pull in opposite directions and both are tested here: ask the people who have
 * not answered, and — more important — never ask anyone else, because for an existing user the
 * question is not merely redundant, it is unanswerable.
 */

describe('needsWorkspaceName', () => {
  it('asks a brand new account with no company', () => {
    expect(needsWorkspaceName({ hasCompany: false, hasWorkspace: false })).toBe(true)
  })

  it('does not ask someone who answered on the sign-up form', () => {
    expect(needsWorkspaceName({ hasCompany: true, hasWorkspace: false })).toBe(false)
  })

  /**
   * The invited-teammate case, and the one that would do real damage. They have a workspace, named
   * by whoever created it, and this screen has no power to rename it — so asking would collect an
   * answer, appear to accept it, and change nothing.
   */
  it('does not ask anyone who already has a workspace', () => {
    expect(needsWorkspaceName({ hasCompany: false, hasWorkspace: true })).toBe(false)
    expect(needsWorkspaceName({ hasCompany: true, hasWorkspace: true })).toBe(false)
  })
})

describe('suggestCompanyFromEmail', () => {
  it('reads a company domain, hyphens and word TLDs included', () => {
    expect(suggestCompanyFromEmail('chris@super-conscious.studio')).toBe('Super Conscious Studio')
    expect(suggestCompanyFromEmail('ada@initech.com')).toBe('Initech')
  })

  /**
   * A word TLD is usually the point — an agency on .agency or .design picked it deliberately, and
   * dropping it would leave a name its owner does not use.
   */
  it('keeps a TLD that is part of the name and drops one that is plumbing', () => {
    expect(suggestCompanyFromEmail('sam@thoughtful.agency')).toBe('Thoughtful Agency')
    expect(suggestCompanyFromEmail('sam@thoughtful.io')).toBe('Thoughtful')
    expect(suggestCompanyFromEmail('sam@thoughtful.co.uk')).toBe('Thoughtful')
  })

  /**
   * Nothing rather than a wrong guess. "Gmail" is not where anybody works, and a prefilled field
   * that is confidently wrong is worse than an empty one — an empty box asks a question, a wrong
   * one invites you to accept it.
   */
  it('refuses to guess from a personal mailbox', () => {
    expect(suggestCompanyFromEmail('chris@gmail.com')).toBe('')
    expect(suggestCompanyFromEmail('chris@icloud.com')).toBe('')
    expect(suggestCompanyFromEmail('chris@proton.me')).toBe('')
    expect(suggestCompanyFromEmail('chris@hotmail.co.uk')).toBe('')
  })

  it('is unbothered by junk, case and whitespace', () => {
    expect(suggestCompanyFromEmail('')).toBe('')
    expect(suggestCompanyFromEmail('not-an-email')).toBe('')
    expect(suggestCompanyFromEmail('chris@')).toBe('')
    expect(suggestCompanyFromEmail('chris@localhost')).toBe('')
    expect(suggestCompanyFromEmail('  CHRIS@Initech.COM  ')).toBe('Initech')
  })

  /** A domain that is nothing but suffix still has to produce something rather than an empty name. */
  it('never strips a name down to nothing', () => {
    expect(suggestCompanyFromEmail('a@com.com')).toBe('Com')
  })

  it('never suggests something the field would then reject', () => {
    const long = `a@${'x'.repeat(120)}.com`
    expect(suggestCompanyFromEmail(long).length).toBeLessThanOrEqual(MAX_WORKSPACE_NAME)
    expect(isWorkspaceNameValid(suggestCompanyFromEmail(long))).toBe(true)
  })
})

describe('validateWorkspaceName', () => {
  it('accepts an ordinary name', () => {
    expect(validateWorkspaceName('Initech')).toBeNull()
    expect(isWorkspaceNameValid('Initech')).toBe(true)
  })

  it('rejects blank and whitespace-only, which would name a workspace nothing at all', () => {
    expect(validateWorkspaceName('')).toBeTruthy()
    expect(validateWorkspaceName('   ')).toBeTruthy()
    expect(isWorkspaceNameValid('   ')).toBe(false)
  })

  it('rejects a name past the cap but accepts one exactly at it', () => {
    expect(validateWorkspaceName('x'.repeat(MAX_WORKSPACE_NAME))).toBeNull()
    expect(validateWorkspaceName('x'.repeat(MAX_WORKSPACE_NAME + 1))).toBeTruthy()
  })

  /** Trailing spaces are a paste artefact, not a decision to have a longer name. */
  it('measures the trimmed name', () => {
    expect(validateWorkspaceName(`  ${'x'.repeat(MAX_WORKSPACE_NAME)}  `)).toBeNull()
  })
})
