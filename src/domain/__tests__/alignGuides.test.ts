import { describe, expect, it } from 'vitest'
import { alignSnap, type Box } from '../alignGuides'

/**
 * The lines that appear while a card is dragged, and the nudge that makes the edge actually meet.
 *
 * The failure worth guarding is not "it did not snap" — that is visible the moment you drag
 * something. It is the board fighting you: a card that jumps somewhere nobody pointed at because
 * two neighbours both matched, or one that flickers between two equally-near lines as the pointer
 * jitters. Those are the cases weighted here.
 */

const box = (x: number, y: number, w = 100, h = 60): Box => ({ x, y, w, h })

describe('snapping to an edge', () => {
  it('pulls a near-miss into line and says where the line is', () => {
    const moving = box(103, 300)
    const { dx, guides } = alignSnap(moving, [box(100, 100)], 8)
    expect(dx).toBe(-3)
    expect(guides).toHaveLength(1)
    expect(guides[0]).toMatchObject({ axis: 'x', at: 100 })
  })

  it('leaves a card alone when nothing is near', () => {
    expect(alignSnap(box(400, 400), [box(100, 100)], 8)).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('aligns middles, not only edges', () => {
    // Moving's centre is at 155; the other's centre is at 150. Within tolerance, so it closes.
    const { dx } = alignSnap(box(105, 300), [box(100, 100)], 8)
    expect(dx).toBe(-5)
  })

  it('snaps the far edge to a near edge, which is how cards get stacked flush', () => {
    // moving.x + w = 198 against other.x = 200.
    const { dx } = alignSnap(box(98, 300), [box(200, 100)], 8)
    expect(dx).toBe(2)
  })

  it('works on both axes at once', () => {
    const { dx, dy, guides } = alignSnap(box(103, 204), [box(100, 200)], 8)
    expect(dx).toBe(-3)
    expect(dy).toBe(-4)
    expect(guides.map((g) => g.axis).sort()).toEqual(['x', 'y'])
  })
})

describe('not fighting the pointer', () => {
  /**
   * A card near several neighbours must take ONE alignment per axis. Applying each near-match in
   * turn means the last one wins and the card lands somewhere nobody aimed at.
   */
  it('takes the nearest candidate, not the last one seen', () => {
    const { dx } = alignSnap(box(103, 300), [box(120, 100), box(100, 500)], 8)
    expect(dx).toBe(-3)
  })

  it('emits at most one guide per axis', () => {
    const { guides } = alignSnap(box(101, 201), [box(100, 200), box(102, 202), box(99, 199)], 8)
    expect(guides.filter((g) => g.axis === 'x')).toHaveLength(1)
    expect(guides.filter((g) => g.axis === 'y')).toHaveLength(1)
  })

  it('is stable on a tie, so a jittering pointer does not flicker between two lines', () => {
    // Equidistant either side. Whatever it picks, it must pick the same one every time.
    const others = [box(95, 100), box(105, 500)]
    const first = alignSnap(box(100, 300), others, 8)
    for (let i = 0; i < 5; i++) expect(alignSnap(box(100, 300), others, 8)).toEqual(first)
  })
})

describe('the line it draws', () => {
  it('reaches from the topmost card to the bottommost, so it joins what it is about', () => {
    const { guides } = alignSnap(box(100, 400, 100, 60), [box(100, 100, 100, 60)], 8)
    const g = guides.find((x) => x.axis === 'x')!
    expect(g.from).toBe(100)
    expect(g.to).toBe(460)
  })

  it('spans every card sharing the line, not just the first', () => {
    const { guides } = alignSnap(box(100, 700, 100, 60), [box(100, 100, 100, 60), box(100, 300, 100, 60)], 8)
    const g = guides.find((x) => x.axis === 'x')!
    expect(g.from).toBe(100)
    expect(g.to).toBe(760)
  })
})

describe('switched off', () => {
  it('does nothing with no tolerance, so the feature can be disabled without a second code path', () => {
    expect(alignSnap(box(101, 201), [box(100, 200)], 0)).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('does nothing with nothing to align to', () => {
    expect(alignSnap(box(101, 201), [], 8)).toEqual({ dx: 0, dy: 0, guides: [] })
  })
})
