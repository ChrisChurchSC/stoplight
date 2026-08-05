import { describe, expect, it } from 'vitest'
import { contextGapMessage, contextGaps } from '../contextGaps'

/**
 * THE RULE BEHIND "REFUSE, OR REPORT".
 *
 * copyBlockerFor owns the absolutes and copyBlocker.test.ts pins them. This pins the band past
 * them: a campaign that is allowed to generate, and how much it has actually said. The thing worth
 * defending is that the answer tracks what the WRITER reads — a gap reported over a campaign that
 * pinned its pools fine would train people to ignore the toast, and a campaign that pinned nothing
 * reported as fine is the silence this exists to break.
 */

const refs = (...types: string[]) => types.map((type) => ({ type }))

describe('contextGaps', () => {
  it('a campaign with nothing wired is missing all three', () => {
    expect(contextGaps({ refs: [], directionCount: 0 })).toEqual(['audience', 'proof', 'angle'])
  })

  it('a segment answers the audience gap', () => {
    expect(contextGaps({ refs: refs('segment'), directionCount: 0 })).toEqual(['proof', 'angle'])
  })

  it('a named person is an audience too', () => {
    // The writer sends personas as who the asset speaks to, so a campaign wired to one is addressed.
    expect(contextGaps({ refs: refs('person'), directionCount: 0 })).toEqual(['proof', 'angle'])
  })

  it('a data set counts as proof', () => {
    // A table is evidence. Reporting "no proof" over a campaign wired to real numbers would be false.
    expect(contextGaps({ refs: refs('dataset'), directionCount: 0 })).toEqual(['audience', 'angle'])
  })

  it('direction typed on a card states an angle, with no message record', () => {
    expect(contextGaps({ refs: [], directionCount: 1 })).toEqual(['audience', 'proof'])
  })

  it('a message record states an angle with no direction typed', () => {
    expect(contextGaps({ refs: refs('message'), directionCount: 0 })).toEqual(['audience', 'proof'])
  })

  it('a concept states one as well', () => {
    expect(contextGaps({ refs: refs('concept'), directionCount: 0 })).toEqual(['audience', 'proof'])
  })

  it('a fully pinned campaign has no gaps', () => {
    expect(contextGaps({ refs: refs('segment', 'proof', 'message'), directionCount: 3 })).toEqual([])
  })

  it('structural refs alone are not context', () => {
    // Company / channel / voice say WHERE and HOW, never who it is for or what proves it. A campaign
    // wired only to these still writes from the whole library, so it must still be reported.
    expect(contextGaps({ refs: refs('company', 'voice'), directionCount: 0 })).toEqual(['audience', 'proof', 'angle'])
  })
})

describe('contextGapMessage', () => {
  it('says nothing when nothing is missing', () => {
    expect(contextGapMessage([])).toBeNull()
  })

  it('names at most two gaps, and the leading gap decides the consequence', () => {
    const msg = contextGapMessage(['audience', 'proof', 'angle'], 'Spring launch')
    expect(msg).toBe(
      'No audience or proof point is wired to "Spring launch" — the copy rotates every audience the brand has, so it is written to no one in particular.',
    )
    // The third is left out on purpose: a list of three reads as a scolding.
    expect(msg).not.toContain('message or angle')
  })

  it('drops the campaign name when the caller has already said it', () => {
    // The build path prefixes with "Built · N drafts." and has just opened the campaign.
    expect(contextGapMessage(['proof'])).toBe(
      'No proof point is wired — the copy leans on whatever proof the brand has rather than the point this campaign is making.',
    )
  })

  /**
   * THE CARD THAT IS ALREADY THERE.
   *
   * Every one of these is a real gap: nothing reaches the writer, so the copy came out of the whole
   * library either way. What changes is what the person is looking at while they read the toast. A
   * board with an Audience card on it and a board with none are the same to contextGaps and must not
   * be the same to the sentence, because on one of them "add an audience" is advice to make a
   * duplicate of something already in view.
   */
  it('speaks about the card on the board instead of the fallback, when there is one', () => {
    expect(contextGapMessage(['audience'], 'Spring launch', 'unwired')).toBe(
      'No audience is wired to "Spring launch" — there is one on this board with no line to the brief, so nothing it says reaches the copy.',
    )
    expect(contextGapMessage(['audience'], undefined, 'unnamed')).toBe(
      'No audience is wired — the one on this board names no record yet, so nothing it says reaches the copy.',
    )
    expect(contextGapMessage(['audience'], undefined, 'overridden')).toBe(
      'No audience is wired — one is wired to the brief, but every asset here overrides the brief with records of its own.',
    )
  })

  it('names one gap only once it is talking about a specific card', () => {
    // "No audience or proof point is wired — there is one on this board" would leave the reader
    // working out which of the two it means, and the standing was only ever computed for the first.
    expect(contextGapMessage(['audience', 'proof'], undefined, 'unwired')).toBe(
      'No audience is wired — there is one on this board with no line to the brief, so nothing it says reaches the copy.',
    )
  })

  it('keeps the fallback wording when the board has nothing of that kind', () => {
    // The default, and what every existing caller gets without passing a standing at all.
    expect(contextGapMessage(['audience'], undefined, 'none')).toBe(contextGapMessage(['audience']))
  })
})
