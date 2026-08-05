import { describe, expect, it } from 'vitest'
import { edgeKey, onTrail, trailSide, trailThrough, type TrailEdge } from '../cardTrail'

/**
 * THE TRAIL THROUGH ONE CARD.
 *
 * Select an asset and the board says how it got made and what follows it. These pin the three
 * things that make that honest on a graph a person drew by hand: it reaches the head of a long
 * chain, it does NOT reach sideways into the campaign's other channels, and it terminates on a
 * cycle. The last one is not hypothetical — the canvas lets you wire a card back into its own
 * feeder, and a walk without a visited set would sit in that loop until the tab dies.
 *
 * The shape used throughout is the one the canvas actually renders: context cards wired into the
 * brief, the brief wired to each channel, each channel wired to its posts, and a channel that
 * branches off a post standing for the next step in a journey.
 */

/** brand → message → campaign → blog → post-1, with a second channel hanging off the brief. */
const CAMPAIGN: TrailEdge[] = [
  { from: 'brand', to: 'message' },
  { from: 'message', to: 'campaign' },
  { from: 'campaign', to: 'blog|article' },
  { from: 'blog|article', to: 'row_1' },
  { from: 'campaign', to: 'email|newsletter' },
  { from: 'email|newsletter', to: 'row_2' },
]

const key = (e: TrailEdge) => edgeKey(e.from, e.to)

describe('trailThrough backwards', () => {
  it('reaches the card at the head of the chain, not just the nearest one', () => {
    const t = trailThrough(CAMPAIGN, 'row_1')
    expect([...t.back].sort()).toEqual(['blog|article', 'brand', 'campaign', 'message'])
    expect(t.backDepth).toBe(4)
  })

  it('leaves the campaign’s other channels off the trail', () => {
    const t = trailThrough(CAMPAIGN, 'row_1')
    // The sibling channel hangs off the same brief, so it is one hop from a node ON the trail. It
    // is still not a step towards this asset, and lighting it would make the highlight meaningless
    // on any campaign with more than one channel.
    expect(t.back.has('email|newsletter')).toBe(false)
    expect(onTrail(t, 'row_2')).toBe(false)
  })

  it('marks every edge along the chain and nothing beside it', () => {
    const t = trailThrough(CAMPAIGN, 'row_1')
    expect(t.edges.get(key({ from: 'brand', to: 'message' }))).toBe('back')
    expect(t.edges.get(key({ from: 'blog|article', to: 'row_1' }))).toBe('back')
    expect(t.edges.has(key({ from: 'campaign', to: 'email|newsletter' }))).toBe(false)
  })

  it('counts the selected card itself as on the trail', () => {
    const t = trailThrough(CAMPAIGN, 'row_1')
    expect(onTrail(t, 'row_1')).toBe(true)
    expect(trailSide(t, 'row_1')).toBe('back')
  })
})

describe('trailThrough forwards', () => {
  /** row_1 is the step a follow-up email branches off: asset → next channel → next asset. */
  const JOURNEY: TrailEdge[] = [
    ...CAMPAIGN,
    { from: 'row_1', to: 'email|followup' },
    { from: 'email|followup', to: 'row_3' },
  ]

  it('follows the journey on from the selected asset', () => {
    const t = trailThrough(JOURNEY, 'row_1')
    expect([...t.fwd].sort()).toEqual(['email|followup', 'row_3'])
    expect(t.fwdDepth).toBe(2)
    expect(trailSide(t, 'row_3')).toBe('fwd')
  })

  it('keeps the two sides apart', () => {
    const t = trailThrough(JOURNEY, 'row_1')
    expect(t.edges.get(key({ from: 'row_1', to: 'email|followup' }))).toBe('fwd')
    expect(t.edges.get(key({ from: 'blog|article', to: 'row_1' }))).toBe('back')
  })

  it('reads the same trail from the far end, with the sides swapped', () => {
    const t = trailThrough(JOURNEY, 'row_3')
    expect(t.back.has('row_1')).toBe(true)
    expect(t.back.has('brand')).toBe(true)
    expect(t.fwd.size).toBe(0)
  })

  it('drops an edge that leaves the trail on one end', () => {
    // A context card wired straight to a LATER step: it feeds that step without passing through
    // the selection, so the line is not part of this asset's route either way.
    const t = trailThrough([...JOURNEY, { from: 'brand', to: 'row_3' }], 'row_1')
    expect(t.edges.has(key({ from: 'brand', to: 'row_3' }))).toBe(false)
    expect(onTrail(t, 'brand')).toBe(true)
    expect(onTrail(t, 'row_3')).toBe(true)
  })
})

describe('trailThrough on a graph drawn by hand', () => {
  it('terminates on a cycle rather than looping', () => {
    const cycle: TrailEdge[] = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ]
    const t = trailThrough(cycle, 'a')
    // Every node on the ring reaches `a` and is reached BY it. The question a selection asks is
    // "what led here", so the collision resolves to back and the picture stays a trail.
    expect([...t.back].sort()).toEqual(['b', 'c'])
    expect(t.fwd.size).toBe(0)
    expect(t.backDepth).toBe(2)
  })

  it('survives a card wired to itself', () => {
    const t = trailThrough([{ from: 'a', to: 'a' }], 'a')
    expect(t.back.size).toBe(0)
    expect(t.fwd.size).toBe(0)
    expect(t.edges.get(key({ from: 'a', to: 'a' }))).toBe('back')
  })

  it('takes a node reached down two paths once', () => {
    const diamond: TrailEdge[] = [
      { from: 'brand', to: 'left' },
      { from: 'brand', to: 'right' },
      { from: 'left', to: 'row_1' },
      { from: 'right', to: 'row_1' },
    ]
    const t = trailThrough(diamond, 'row_1')
    expect([...t.back].sort()).toEqual(['brand', 'left', 'right'])
    expect(t.backDepth).toBe(2)
  })

  it('has no trail at all for an unwired card', () => {
    const t = trailThrough(CAMPAIGN, 'co_loose')
    expect(t.back.size).toBe(0)
    expect(t.fwd.size).toBe(0)
    expect(t.edges.size).toBe(0)
  })

  it('duplicated connectors do not double the hop count', () => {
    const t = trailThrough([...CAMPAIGN, { from: 'blog|article', to: 'row_1' }], 'row_1')
    expect(t.backDepth).toBe(4)
  })
})
