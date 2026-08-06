import { describe, expect, it } from 'vitest'
import { cutForEdge, type CutDeliv, type CutRow } from '../edgeCut'

/**
 * A ✕ APPEARS ON A LINE ONLY WHEN THERE IS SOMETHING BEHIND IT TO CUT.
 *
 * The board draws lines it was never told to draw: a post sits under its channel because it IS one
 * of that channel's assets, and the line says so. Offering to delete one of those would be offering
 * to delete a fact — the button would either do nothing or quietly move a card the person was not
 * asking to move.
 *
 * Two of the derived lines are different, and both record a decision on the rows: a channel taking
 * the brief's records, and a channel that follows the asset it was added from. Those are the two the
 * rule has to say yes to, and nothing else.
 */

// A campaign with an Instagram reel channel at the top level, plus a second reel channel that was
// added from the launch film's "+" and so follows it, plus a blog post channel that follows nothing.
const LAUNCH_FILM: CutRow = { id: 'row-film', assetName: 'Launch film' }
const ROWS: CutRow[] = [LAUNCH_FILM, { id: 'row-reel-1', assetName: 'Reel one' }, { id: 'row-post-1', assetName: 'Blog one' }]

const TOP_LEVEL_REEL: CutDeliv = { key: 'instagram|reel', channel: 'instagram', assetType: 'reel', rows: [{}] }
const BRANCHED_REEL: CutDeliv = {
  key: 'instagram|reel|↳Launch film',
  channel: 'instagram',
  assetType: 'reel',
  rows: [{ branchOf: 'Launch film' }],
}
const BLOG: CutDeliv = { key: 'blog|post', channel: 'blog', assetType: 'post', rows: [{}] }

describe('what cutting a derived line would do', () => {
  it('lets the campaign be cut off from a channel', () => {
    expect(cutForEdge('campaign', 'blog|post', [BLOG], ROWS)).toEqual({ kind: 'detach', deliv: 'blog|post' })
  })

  it('lets a channel stop following the asset it was added from, and names that asset', () => {
    expect(cutForEdge('row-film', BRANCHED_REEL.key, [BRANCHED_REEL, BLOG], ROWS)).toEqual({
      kind: 'unbranch',
      deliv: BRANCHED_REEL.key,
      source: 'Launch film',
      mergesInto: false,
    })
  })

  /**
   * THE ONE THAT MATTERS. Every line from a channel down to its own posts, and every line in the
   * builder from a deliverable to its sub-cards, ends at something that is not a deliverable key —
   * so the lookup misses and no cut is offered. Loosen this and every post on the board grows a ✕
   * that moves a card instead of removing a line.
   */
  it('offers nothing on a line that ends at a post', () => {
    const delivs = [TOP_LEVEL_REEL, BRANCHED_REEL, BLOG]
    const targets = ['row-film', 'row-reel-1', 'row-post-1', 'dl_abc:0', 'dl_abc:3']
    const offered = targets.filter((t) => cutForEdge(BLOG.key, t, delivs, ROWS) !== null)
    expect(offered).toEqual([])
  })

  /**
   * The cut has to be offered on the line that is DRAWN, and the drawn line runs from the one asset
   * named by branchOf. A second asset sitting near the same channel has no line to it, so being
   * asked about that pair means the board and this rule have drifted apart.
   */
  it('offers nothing from an asset the channel does not follow', () => {
    expect(cutForEdge('row-reel-1', BRANCHED_REEL.key, [BRANCHED_REEL], ROWS)).toBeNull()
  })

  it('offers nothing when the asset a channel follows is gone', () => {
    // branchOf holds a NAME, so a renamed or deleted source leaves the branch pointing at nothing.
    // The board draws no line in that state, so there is none to cut.
    const orphan: CutDeliv = { ...BRANCHED_REEL, rows: [{ branchOf: 'A film that was renamed' }] }
    expect(cutForEdge('row-film', orphan.key, [orphan], ROWS)).toBeNull()
  })

  /**
   * Dropping the branch changes what the deliverable IS keyed by, so where the campaign already has
   * that channel and type at the top level the two cards become one and the assets move under it.
   * The flag is what lets the toast say that instead of "the line is gone".
   */
  it('says when cutting would merge the channel into one the campaign already has', () => {
    const withSibling = cutForEdge('row-film', BRANCHED_REEL.key, [TOP_LEVEL_REEL, BRANCHED_REEL], ROWS)
    expect(withSibling).toMatchObject({ kind: 'unbranch', mergesInto: true })
    const alone = cutForEdge('row-film', BRANCHED_REEL.key, [BRANCHED_REEL], ROWS)
    expect(alone).toMatchObject({ kind: 'unbranch', mergesInto: false })
  })
})
