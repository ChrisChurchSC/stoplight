import { describe, expect, it } from 'vitest'
import { directionForRow } from '../boardResolve'
import type { ResolvedDirection } from '../boardResolve'

/**
 * A CHANNEL CUT OFF FROM THE BRIEF TAKES NOTHING FROM IT.
 *
 * A channel hangs off its campaign because its assets carry the campaign's name, so that line is
 * derived and there is no connector to remove. Cutting it is recorded as an absence instead
 * (FlowBoard.detached), and this is the point where the absence has to bite: without it the line
 * would be gone from the canvas while every instruction on the campaign kept reaching the copy.
 *
 * That is the one failure a board must not have. The picture is the explanation of the writing, so a
 * picture that says "these are not connected" beside writing that came from the connection is worse
 * than having no picture: it is a wrong answer given confidently.
 *
 * The panel and the writer call this same function, so what a person is shown and what the model is
 * sent cannot disagree about it either.
 */

const d = (key: string, value: string): ResolvedDirection => ({ key, value } as ResolvedDirection)

const resolved = {
  campaign: [d('pain', 'Storms arrive faster than plans do')],
  byTarget: new Map<string, ResolvedDirection[]>([['youtube|long-form', [d('likeThis', 'Plain, no hype')]]]),
}
const legacy = [d('avoidSay', 'Never say unprecedented')]

const KEY = 'youtube|long-form'
const ROW = 'row_1'

describe('a channel cut off from the brief', () => {
  it('takes the campaign direction when it is attached', () => {
    const out = directionForRow(resolved, KEY, ROW, legacy, [])
    expect(out.map((x) => x.key)).toEqual(['likeThis', 'pain', 'avoidSay'])
  })

  it('takes none of it when it is cut off', () => {
    const out = directionForRow(resolved, KEY, ROW, legacy, [KEY])
    expect(out.map((x) => x.key)).toEqual(['likeThis'])
  })

  /**
   * Legacy campaign-level direction predates the move onto cards and is campaign-wide by definition,
   * so it goes with the rest. Pinned separately because it arrives by a different route and is easy
   * to leave behind: it is passed in by the caller rather than resolved from the board.
   */
  it('drops the legacy campaign direction too, not only what the cards say', () => {
    const out = directionForRow(resolved, KEY, ROW, legacy, [KEY])
    expect(out.some((x) => x.key === 'avoidSay')).toBe(false)
  })

  /** What is wired to the CHANNEL is the channel's own, and survives the cut. */
  it('keeps what is wired straight to it', () => {
    const out = directionForRow(resolved, KEY, ROW, legacy, [KEY])
    expect(out).toEqual([d('likeThis', 'Plain, no hype')])
  })

  it('keeps what is wired straight to the asset', () => {
    const withRow = {
      campaign: resolved.campaign,
      byTarget: new Map([...resolved.byTarget, [ROW, [d('proof', 'Nine years of station data')]]]),
    }
    const out = directionForRow(withRow, KEY, ROW, legacy, [KEY])
    expect(out.map((x) => x.key)).toEqual(['likeThis', 'proof'])
  })

  /** One channel being cut says nothing about any other. */
  it('cuts only the channel named', () => {
    const out = directionForRow(resolved, KEY, ROW, legacy, ['linkedin|post'])
    expect(out.map((x) => x.key)).toEqual(['likeThis', 'pain', 'avoidSay'])
  })

  /** Every board saved before this existed has no such field, and must load unchanged. */
  it('is attached when the board says nothing about it', () => {
    expect(directionForRow(resolved, KEY, ROW, legacy)).toHaveLength(3)
  })
})
