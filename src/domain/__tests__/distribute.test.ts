import { describe, expect, it } from 'vitest'
import { distributeEvenly, type Placed } from '../distribute'

const b = (id: string, x: number, y: number, w = 100, h = 50): Placed => ({ id, x, y, w, h })

/** Where each box ends up once its movement is applied - easier to reason about than the deltas. */
const after = (boxes: Placed[], axis: 'x' | 'y') => {
  const d = distributeEvenly(boxes, axis)
  return boxes.map((x) => ({ id: x.id, at: (axis === 'x' ? x.x : x.y) + (d[x.id] ?? 0) }))
}

/** The gaps between consecutive boxes, in order, once moved. */
const gaps = (boxes: Placed[], axis: 'x' | 'y') => {
  const d = distributeEvenly(boxes, axis)
  const moved = boxes
    .map((x) => ({ start: (axis === 'x' ? x.x : x.y) + (d[x.id] ?? 0), size: axis === 'x' ? x.w : x.h }))
    .sort((p, q) => p.start - q.start)
  return moved.slice(1).map((m, i) => +(m.start - (moved[i].start + moved[i].size)).toFixed(6))
}

describe('distributeEvenly', () => {
  it('equalises the gaps and leaves the ends where they were', () => {
    // 0..100, 150..250, 900..1000 - the middle one is nowhere near halfway.
    const boxes = [b('a', 0, 0), b('b', 150, 0), b('c', 900, 0)]
    expect(after(boxes, 'x')).toEqual([
      { id: 'a', at: 0 },
      { id: 'b', at: 450 },
      { id: 'c', at: 900 },
    ])
    expect(gaps(boxes, 'x')).toEqual([350, 350])
  })

  it('equalises gaps rather than centres, so mixed sizes do not crowd', () => {
    // A tall card between two short ones. Equal CENTRES would put it at 275 and leave it nearly
    // touching the one below; equal GAPS is what reads as even.
    const boxes = [b('a', 0, 0, 100, 40), b('tall', 200, 0, 100, 300), b('c', 0, 700, 100, 40)]
    const g = gaps([b('a', 0, 0, 100, 40), b('tall', 0, 200, 100, 300), b('c', 0, 700, 100, 40)], 'y')
    expect(g[0]).toBeCloseTo(g[1])
    void boxes
  })

  it('works down the vertical axis the same way', () => {
    const boxes = [b('a', 0, 0, 100, 50), b('b', 0, 60, 100, 50), b('c', 0, 500, 100, 50)]
    expect(after(boxes, 'y')).toEqual([
      { id: 'a', at: 0 },
      // span is 0..550 (to the far edge of c), 150 of it filled, so the gap is 200 and b starts at 250.
      { id: 'b', at: 250 },
      { id: 'c', at: 500 },
    ])
  })

  it('orders by position, not by the order they were handed over', () => {
    // Selection order is whatever you clicked in. The run is what is on screen.
    const jumbled = [b('c', 900, 0), b('a', 0, 0), b('b', 150, 0)]
    expect(after(jumbled, 'x')).toEqual([
      { id: 'c', at: 900 },
      { id: 'a', at: 0 },
      { id: 'b', at: 450 },
    ])
  })

  it('does nothing to two boxes, which are already evenly distributed', () => {
    expect(distributeEvenly([b('a', 0, 0), b('b', 500, 0)], 'x')).toEqual({})
  })

  it('does nothing to one, or none', () => {
    expect(distributeEvenly([b('a', 0, 0)], 'x')).toEqual({})
    expect(distributeEvenly([], 'x')).toEqual({})
  })

  it('is idempotent: pressing it again moves nothing', () => {
    const boxes = [b('a', 0, 0), b('b', 150, 0), b('c', 900, 0)]
    const once = distributeEvenly(boxes, 'x')
    const settled = boxes.map((x) => ({ ...x, x: x.x + (once[x.id] ?? 0) }))
    const twice = distributeEvenly(settled, 'x')
    for (const v of Object.values(twice)) expect(v).toBeCloseTo(0)
  })

  it('spaces four evenly, not just the middle one of three', () => {
    const boxes = [b('a', 0, 0), b('b', 110, 0), b('c', 130, 0), b('d', 1000, 0)]
    // span 0..1100, 400 filled, three gaps: (1100-400)/3.
    expect(gaps(boxes, 'x')).toEqual([233.333333, 233.333333, 233.333333])
  })

  it('overlaps evenly rather than refusing when the ends are too close together', () => {
    // Three 100-wide cards inside a 200-wide run: there is no non-overlapping answer, and an even
    // overlap is still the even one. The ends stay put, which is what was asked for.
    const boxes = [b('a', 0, 0), b('mid', 50, 0), b('b', 100, 0)]
    const d = distributeEvenly(boxes, 'x')
    expect(d.a).toBeUndefined()
    expect(d.b).toBeUndefined()
    expect(gaps(boxes, 'x')[0]).toBeLessThan(0)
  })

  it('does not swap two cards that sit at the same coordinate', () => {
    const boxes = [b('z', 100, 0), b('a', 100, 0), b('end', 900, 0)]
    const first = distributeEvenly(boxes, 'x')
    const second = distributeEvenly(boxes, 'x')
    expect(first).toEqual(second)
  })
})
