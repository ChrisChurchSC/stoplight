import { describe, expect, it } from 'vitest'
import { withRefs, withoutRefs } from '../rowRefs'
import type { FlowReference } from '../clients'

const ref = (type: string, id: string): FlowReference => ({ type, id, label: id } as FlowReference)

const CAMPAIGN = [ref('segment', 'aud1')]

describe('withRefs', () => {
  it('starts from the row\'s OWN override, never a sibling\'s', () => {
    // The bug: post #2 pinned a pattern, then a card was wired to the shared channel. The base was
    // taken from "the first row with an override" and written to all three, so #1 and #3 came away
    // carrying #2's pin and the grid read them as made from a record the canvas showed no wire for.
    const pinned = [ref('pattern', 'teardown')]
    const added = [ref('pattern', 'objection')]

    expect(withRefs(pinned, CAMPAIGN, added)).toEqual([ref('pattern', 'teardown'), ref('pattern', 'objection')])
    // Its siblings have no override, so they inherit the campaign and take only what was wired.
    expect(withRefs(undefined, CAMPAIGN, added)).toEqual([ref('segment', 'aud1'), ref('pattern', 'objection')])
    expect(withRefs([], CAMPAIGN, added)).toEqual([ref('segment', 'aud1'), ref('pattern', 'objection')])
  })

  it('adds rather than replaces, and dedupes by type+id', () => {
    const own = [ref('pattern', 'teardown')]
    expect(withRefs(own, CAMPAIGN, [ref('pattern', 'teardown')])).toEqual(own)
    // Same id under a different type is a different record.
    expect(withRefs(own, CAMPAIGN, [ref('message', 'teardown')])).toHaveLength(2)
  })

  it('leaves the input untouched', () => {
    const own = [ref('pattern', 'teardown')]
    withRefs(own, CAMPAIGN, [ref('pattern', 'objection')])
    expect(own).toEqual([ref('pattern', 'teardown')])
  })
})

describe('withoutRefs', () => {
  it('drops only from the row it is given, off that row\'s own base', () => {
    const pinned = [ref('pattern', 'teardown'), ref('pattern', 'objection')]
    expect(withoutRefs(pinned, CAMPAIGN, [ref('pattern', 'objection')])).toEqual([ref('pattern', 'teardown')])
  })

  it('drops from the inherited campaign set when the row has no override', () => {
    expect(withoutRefs(undefined, CAMPAIGN, [ref('segment', 'aud1')])).toEqual([])
    expect(withoutRefs(undefined, CAMPAIGN, [ref('pattern', 'gone')])).toEqual(CAMPAIGN)
  })

  it('leaves the input untouched', () => {
    const own = [ref('pattern', 'teardown')]
    withoutRefs(own, CAMPAIGN, [ref('pattern', 'teardown')])
    expect(own).toEqual([ref('pattern', 'teardown')])
  })
})
