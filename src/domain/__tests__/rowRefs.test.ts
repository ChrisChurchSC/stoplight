import { describe, expect, it } from 'vitest'
import { editRefs, sharedRefs, withRefs, withoutRefs } from '../rowRefs'
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

describe('editRefs', () => {
  it('resolves the base ONCE, so dropping the last record does not re-inherit the campaign', () => {
    // The trap that made this one function rather than a compose of the two wrappers: chaining them
    // re-asks "does this row have an override?" against the intermediate result, and a row emptied
    // by `drop` answers no and takes back the whole campaign set it was just cleared of.
    const own = [ref('pattern', 'teardown')]
    expect(editRefs(own, CAMPAIGN, { drop: [ref('pattern', 'teardown')] })).toEqual([])
    expect(withoutRefs(withoutRefs(own, CAMPAIGN, [ref('pattern', 'teardown')]), CAMPAIGN, [])).toEqual(CAMPAIGN)
  })

  it('applies drop before add, so a replace lands as one record', () => {
    const own = [ref('pattern', 'teardown'), ref('segment', 'aud1')]
    expect(editRefs(own, CAMPAIGN, { drop: [ref('pattern', 'teardown')], add: [ref('pattern', 'objection')] }))
      .toEqual([ref('segment', 'aud1'), ref('pattern', 'objection')])
  })

  it('is a no-op with no ops', () => {
    const own = [ref('pattern', 'teardown')]
    expect(editRefs(own, CAMPAIGN, {})).toEqual(own)
    expect(editRefs(undefined, CAMPAIGN, {})).toEqual(CAMPAIGN)
  })
})

describe('sharedRefs', () => {
  it('is what EVERY asset carries, not what the first one happens to', () => {
    // The readout half of the leak: post #2's private pin presented as a fact about the channel,
    // with an editor attached that would then write it to the rest of them.
    const rows = [
      { references: [ref('segment', 'aud1'), ref('pattern', 'teardown')] },
      { references: [ref('segment', 'aud1')] },
      { references: [ref('segment', 'aud1')] },
    ]
    expect(sharedRefs(rows, CAMPAIGN)).toEqual([ref('segment', 'aud1')])
  })

  it('treats a row with no override as carrying the campaign set', () => {
    expect(sharedRefs([{ references: [ref('segment', 'aud1')] }, {}], CAMPAIGN)).toEqual([ref('segment', 'aud1')])
    // A row pinned to something else shares nothing with an inheriting sibling.
    expect(sharedRefs([{ references: [ref('pattern', 'p1')] }, {}], CAMPAIGN)).toEqual([])
  })

  it('inherits the campaign when there are no rows to disagree', () => {
    expect(sharedRefs([], CAMPAIGN)).toEqual(CAMPAIGN)
  })
})
