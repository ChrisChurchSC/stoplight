import { describe, expect, it } from 'vitest'
import { DIRECTION_KEYS, RETIRED_DIRECTION, capFor } from '../direction'
import {
  OBJECT_CARD_KINDS,
  UnknownObjectFieldError,
  applyDirection,
  describeObjectFields,
  directionCoverage,
  objectCardView,
} from '../objectFields'
import type { CanvasObject } from '../flowBoard'

/**
 * THE OTHER CARD, AND THE SAME FAILURE.
 *
 * An object card instructs the copy writer: an Audience card carrying the pain to argue from, a
 * Trigger carrying what the reader just did and what to ask them. That instruction — direction — is
 * what the card CONTRIBUTES. A card with none is a name on a board.
 *
 * The vocabulary is closed, differs per kind, and was reachable only from inside the app. These
 * tests pin what an agent can now see and write: every kind's real questions, an unknown key
 * refused rather than stored where nothing reads it, and coverage that tells a card contributing
 * nothing from one that is genuinely finished.
 */

const card = (over: Partial<CanvasObject> = {}): CanvasObject => ({ id: 'co_1', kind: 'audience', text: '', ...over })

describe('what each kind asks', () => {
  it('offers a question set for every creatable kind, and never invents one', () => {
    for (const kind of OBJECT_CARD_KINDS) {
      const keys = describeObjectFields(kind).map((f) => f.key)
      const retired = new Set(RETIRED_DIRECTION[kind] ?? [])
      const expected = (DIRECTION_KEYS[kind] ?? []).filter((k) => !retired.has(k))
      expect(keys, `${kind}: disagrees with the direction vocabulary`).toEqual(expected)
    }
  })

  it('drops a field a kind has withdrawn', () => {
    // A Voice card keeps old answers, but directionOf never sends them — so offering the field to
    // an agent would be offering one whose answer reaches nothing.
    expect(RETIRED_DIRECTION.voice).toContain('likeThis')
    expect(describeObjectFields('voice').map((f) => f.key)).not.toContain('likeThis')
  })

  it('carries each question’s label, hint and cap from the panel’s own vocabulary', () => {
    const [pain] = describeObjectFields('audience')
    expect(pain).toMatchObject({ key: 'pain', label: 'Lean on this pain', hardLimit: capFor('pain') })
    expect(pain.hint.length).toBeGreaterThan(0)
  })
})

describe('answering a card', () => {
  it('writes every question the kind asks, to complete', () => {
    for (const kind of OBJECT_CARD_KINDS) {
      const keys = describeObjectFields(kind).map((f) => f.key)
      const fields = Object.fromEntries(keys.map((k) => [k, `answer for ${k}`]))
      const { direction } = applyDirection(kind, [], fields)
      const coverage = directionCoverage(kind, direction)
      expect(coverage.missing, `${kind}: questions left unanswerable`).toEqual([])
      expect(coverage.complete, `${kind}: not complete after answering everything`).toBe(true)
    }
  })

  it('refuses a key the kind does not ask for, naming the ones it does', () => {
    try {
      applyDirection('audience', [], { figure: '3x faster' })
      expect.unreachable('expected an UnknownObjectFieldError')
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownObjectFieldError)
      expect((e as UnknownObjectFieldError).validKeys).toEqual(['pain', 'objection'])
    }
  })

  it('says plainly when a kind asks for nothing at all', () => {
    expect(describeObjectFields('voice')).toEqual([])
    expect(() => applyDirection('voice', [], { pain: 'x' })).toThrow(/asks for no direction/)
    // And is not reported permanently unfinished: contributing through its record is the design.
    expect(directionCoverage('voice', []).complete).toBe(true)
    expect(directionCoverage('voice', []).asksNothing).toBe(true)
  })

  it('keeps answers the write did not mention', () => {
    const { direction } = applyDirection('audience', [{ key: 'pain', value: 'Kept' }], { objection: 'New' })
    expect(Object.fromEntries(direction.map((e) => [e.key, e.value]))).toEqual({ pain: 'Kept', objection: 'New' })
  })

  it('clears a key with an empty answer rather than storing a blank', () => {
    const { direction } = applyDirection('audience', [{ key: 'pain', value: 'Gone' }], { pain: '' })
    expect(direction).toEqual([])
  })

  it('trims an answer past its cap', () => {
    const { direction, clamped } = applyDirection('season', [], { moment: 'x'.repeat(200) })
    expect(direction[0].value.length).toBeLessThanOrEqual(capFor('moment'))
    expect(clamped).toContain('moment')
  })
})

describe('reading a card back', () => {
  it('reports a card that contributes nothing as incomplete', () => {
    const view = objectCardView(card({ name: 'Enterprise, cold' }))
    expect(view.name).toBe('Enterprise, cold')
    expect(view.fields.complete).toBe(false)
    expect(view.fields.missing).toEqual(['pain', 'objection'])
  })

  it('reports a fully answered card as complete', () => {
    const view = objectCardView(
      card({ direction: [{ key: 'pain', value: 'Manual handoff' }, { key: 'objection', value: 'Too small to bother' }] }),
    )
    expect(view.fields.complete).toBe(true)
    expect(view.direction).toEqual({ pain: 'Manual handoff', objection: 'Too small to bother' })
  })

  it('does not count a blank answer as answered', () => {
    expect(directionCoverage('audience', [{ key: 'pain', value: '   ' }]).filled).toEqual([])
  })
})
