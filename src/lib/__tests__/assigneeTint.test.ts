import { describe, expect, it } from 'vitest'
import { ASSIGNEE_TINTS, assignTints, renameTint } from '../assigneeTint'
import { recordTint } from '../../domain/records'

/**
 * TWO OWNERS MUST NOT SHARE A COLOUR, on the one column whose job is telling people apart.
 *
 * The shared recordTint sums character codes into seven tints, so it collides on ordinary names —
 * "Laura" and "Ryan" come out the same yellow, which is what prompted this. A hash cannot promise
 * otherwise; assigning over the known set can, which is the whole reason this exists and the thing
 * worth holding it to.
 */

/** Relative luminance / contrast, so the palette's own claim is checked rather than trusted. */
const lin = (c: number) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
/** CIELAB distance — a stand-in for "would these read as two colours", better than comparing hex. */
const labDistance = (a: string, b: string) => {
  const toLab = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    const [X, Y, Z] = [
      (r * 0.4124 + g * 0.3576 + bl * 0.1805) / 0.95047,
      r * 0.2126 + g * 0.7152 + bl * 0.0722,
      (r * 0.0193 + g * 0.1192 + bl * 0.9505) / 1.08883,
    ]
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
  }
  const [la, lb] = [toLab(a), toLab(b)]
  return Math.hypot(...la.map((v, i) => v - lb[i]))
}

const contrastWithWhite = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return 1.05 / (l + 0.05)
}

describe('assigneeTints', () => {
  it('gives the names that collide under the old hash different colours', () => {
    // The pair that started this, plus two more that also share a slot under recordTint.
    expect(recordTint('Laura'), 'the old hash really does collide').toBe(recordTint('Ryan'))
    expect(recordTint('Jordan')).toBe(recordTint('Casey'))

    const { tints: t } = assignTints(['Casey', 'Chris', 'Jordan', 'Laura', 'Ryan'], {})
    expect(t.get('Laura')).not.toBe(t.get('Ryan'))
    expect(t.get('Jordan')).not.toBe(t.get('Casey'))
  })

  it('gives everyone their own colour up to the size of the palette', () => {
    const names = Array.from({ length: ASSIGNEE_TINTS.length }, (_, i) => `Person ${i}`)
    const got = [...assignTints(names, {}).tints.values()]
    expect(new Set(got).size, 'every name resolved to a colour of its own').toBe(names.length)
  })

  it('keeps a name on its colour when other people arrive', () => {
    // The point of remembering: Laura's colour is decided once and does not move when a team grows
    // around her. A name-derived colour is stable too, but cannot spread; a spread recomputed over
    // whoever is present cannot be stable. Remembering is what buys both.
    const first = assignTints(['Laura', 'Ryan'], {})
    const later = assignTints(['Ana', 'Bo', 'Laura', 'Ryan', 'Zed'], first.store)
    expect(later.tints.get('Laura')).toBe(first.tints.get('Laura'))
    expect(later.tints.get('Ryan')).toBe(first.tints.get('Ryan'))
  })

  it('hands the first few people colours that are actually far apart', () => {
    // Asserting the first three equal ASSIGNEE_TINTS.slice(0, 3) would follow the array whatever
    // order it is in — true by construction, and blind to the reshuffle it is supposed to catch.
    // So this measures: the palette is ordered by a farthest-point walk in CIELAB, and what has to
    // hold is the SEPARATION, not the sequence. Handing the same twelve out in an arbitrary order
    // gives 42 for two people and 23 for four; this order gives 159 and 79.
    const closestPair = (colours: string[]) =>
      Math.min(...colours.flatMap((a, i) => colours.slice(i + 1).map((b) => labDistance(a, b))))

    const spreadFor = (n: number) => closestPair([...assignTints(Array.from({ length: n }, (_, i) => `P${i}`), {}).tints.values()])

    expect(spreadFor(2), 'two people are near-opposite').toBeGreaterThan(120)
    expect(spreadFor(3)).toBeGreaterThan(80)
    expect(spreadFor(4)).toBeGreaterThan(70)
    expect(spreadFor(6)).toBeGreaterThan(35)
    // Even full, no two of the twelve are close enough to read as the same colour.
    expect(spreadFor(ASSIGNEE_TINTS.length)).toBeGreaterThan(20)
  })

  it('carries a colour across a rename, so fixing a typo does not recolour anyone', () => {
    const { store } = assignTints(['Ryna'], {})
    const moved = renameTint(store, 'Ryna', 'Ryan')
    expect(moved.Ryan).toBe(store.Ryna)
    expect(moved.Ryna).toBeUndefined()
  })

  it('runs out rather than throwing when there are more people than colours', () => {
    const names = Array.from({ length: ASSIGNEE_TINTS.length + 5 }, (_, i) => `P${i}`)
    const got = assignTints(names, {}).tints
    expect(got.size).toBe(names.length)
    // Past the palette the colours repeat — the promise was only ever up to its size.
    expect(new Set(got.values()).size).toBe(ASSIGNEE_TINTS.length)
  })

  it('carries white text, which the palette it replaces did not', () => {
    // The avatar draws a white initial on the tint. Every one of recordTint's seven fails this;
    // the worst is 1.92:1 against a 4.5:1 bar, so the letter was hard to read on all of them.
    for (const c of ASSIGNEE_TINTS) {
      expect(contrastWithWhite(c), `${c} against white`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
