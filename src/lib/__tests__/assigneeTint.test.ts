import { describe, expect, it } from 'vitest'
import { ASSIGNEE_TINTS, assigneeTints } from '../assigneeTint'
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

    const t = assigneeTints(['Casey', 'Chris', 'Jordan', 'Laura', 'Ryan'])
    expect(t.get('Laura')).not.toBe(t.get('Ryan'))
    expect(t.get('Jordan')).not.toBe(t.get('Casey'))
  })

  it('gives everyone their own colour up to the size of the palette', () => {
    const names = Array.from({ length: ASSIGNEE_TINTS.length }, (_, i) => `Person ${i}`)
    const got = [...assigneeTints(names).values()]
    expect(new Set(got).size, 'every name resolved to a colour of its own').toBe(names.length)
  })

  it('keeps a name on its colour when the set around it does not change', () => {
    const names = ['Chris', 'Laura', 'Ryan']
    expect(assigneeTints(names)).toEqual(assigneeTints([...names]))
  })

  it('runs out rather than throwing when there are more people than colours', () => {
    const names = Array.from({ length: ASSIGNEE_TINTS.length + 5 }, (_, i) => `P${i}`)
    const got = assigneeTints(names)
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
