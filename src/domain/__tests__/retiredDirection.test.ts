import { describe, expect, it } from 'vitest'
import { directionOf } from '../boardResolve'
import { DIRECTION_KEYS, RETIRED_DIRECTION } from '../direction'
import type { CanvasObject } from '../flowBoard'

/**
 * WITHDRAWING A FIELD FROM THE INSPECTOR IS HALF THE JOB.
 *
 * A card keeps every instruction it was ever given, so a kind that stops ASKING for a field still
 * carries whatever was typed into it before — invisible in the panel, and still shaping the copy.
 * That is the disagreement this codebase keeps having in other forms, and it is at its worst here,
 * because the one thing the panel claims to be is the list of what the writer reads.
 *
 * Two kinds have now withdrawn fields (Voice, then Concept) and neither retirement had a test, so
 * the failure mode is not hypothetical: taking a key out of DIRECTION_KEYS and forgetting
 * RETIRED_DIRECTION type-checks, renders correctly, and quietly keeps feeding the writer. This
 * pins the pair together.
 */

const card = (kind: string, direction: { key: string; value: string }[]): CanvasObject =>
  ({ id: `n_${kind}`, kind, text: '', direction } as unknown as CanvasObject)

describe('a field a kind no longer asks for', () => {
  it('stops reaching the writer from a Concept card', () => {
    const out = directionOf([card('concept', [
      { key: 'claim', value: 'One system instead of five' },
      { key: 'likeThis', value: 'Dry, no adjectives' },
    ])])

    expect(out).toEqual([])
  })

  it('stops reaching the writer from a Voice card', () => {
    const out = directionOf([card('voice', [
      { key: 'likeThis', value: 'Plain, no hype' },
      { key: 'avoidSay', value: 'unprecedented' },
    ])])

    expect(out).toEqual([])
  })

  /**
   * The retirement is per kind, not per key. `claim` is retired on Concept and still asked of a
   * Message card, so a blanket drop would silently mute the one kind whose whole job is the claim.
   */
  it('still reaches the writer from a kind that still asks for it', () => {
    const out = directionOf([card('message', [{ key: 'claim', value: 'One system instead of five' }])])

    expect(out).toEqual([{ kind: 'message', key: 'claim', value: 'One system instead of five' }])
  })

  /**
   * The invariant behind both, stated once so a future retirement cannot land half-done: nothing a
   * kind has withdrawn may still be in the list of what it asks for, or the inspector would put the
   * field back on screen while directionOf threw the answer away.
   */
  it('is never also a field that kind still asks for', () => {
    for (const [kind, retired] of Object.entries(RETIRED_DIRECTION)) {
      const asked = DIRECTION_KEYS[kind] ?? []
      expect(asked.filter((k) => retired?.includes(k))).toEqual([])
    }
  })
})
