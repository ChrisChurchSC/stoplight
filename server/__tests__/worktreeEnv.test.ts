import { describe, expect, it } from 'vitest'
import { mainCheckoutRoot } from '../worktreeEnv.js'

/**
 * Where a worktree's dev server should look for the server secrets. `.env` is gitignored and so
 * absent from every worktree; getting this wrong is what made the AI features report
 * "No model key set." on ports 5174/5199 while the main checkout on 5173 was fine.
 */
describe('mainCheckoutRoot', () => {
  it('returns the checkout above a worktree', () => {
    expect(mainCheckoutRoot('/Users/chris/Documents/GitHub/stoplight/.claude/worktrees/signup-page')).toBe(
      '/Users/chris/Documents/GitHub/stoplight',
    )
  })

  it('handles the nested names EnterWorktree allows', () => {
    expect(mainCheckoutRoot('/repo/.claude/worktrees/fix/model-key')).toBe('/repo')
  })

  it('returns null in the main checkout, so its own .env is the only source', () => {
    expect(mainCheckoutRoot('/Users/chris/Documents/GitHub/stoplight')).toBeNull()
  })

  it('is not fooled by a similarly named directory', () => {
    expect(mainCheckoutRoot('/repo/worktrees/thing')).toBeNull()
    expect(mainCheckoutRoot('/repo/.claude/worktrees')).toBeNull()
  })
})
