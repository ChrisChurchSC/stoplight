import { describe, expect, it } from 'vitest'
import { AGGREGATOR_PULLS } from '../aggregator'

/**
 * The six questions are the first thing a marketer reads on this card, so they get a test: every one
 * is asked in the user's words, and none of them carries a dash the house style forbids.
 */
describe('the six questions', () => {
  it('every pull is asked as a question, with what it decides and a short name', () => {
    for (const p of AGGREGATOR_PULLS) {
      expect(p.question.trim().length, p.id).toBeGreaterThan(0)
      expect(p.decides.trim().length, p.id).toBeGreaterThan(0)
      expect(p.shortName.trim().length, p.id).toBeGreaterThan(0)
    }
  })

  it('no em dash or en dash in anything a user reads', () => {
    for (const p of AGGREGATOR_PULLS) {
      for (const s of [p.question, p.decides, p.shortName, p.label, p.detail]) {
        expect(/[—–]/.test(s), `${p.id}: ${s}`).toBe(false)
      }
    }
  })

  it('short names are distinct, so two data sets cannot collide on name alone', () => {
    const names = AGGREGATOR_PULLS.map((p) => p.shortName)
    expect(new Set(names).size).toBe(names.length)
  })
})
