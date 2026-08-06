import { describe, expect, it } from 'vitest'
import { GROUP_HEAD, GROUP_PAD, GROUP_RIMS, onRim, rimCovers, rimsFor } from '../groupFrame'

/**
 * THE GRAB BAND MUST BE A RING, NOT A LID.
 *
 * A group's frame is pass-through on purpose: it is drawn behind its cards, and a click inside it
 * belongs to the card under the pointer, or to the canvas between cards, where it starts a marquee
 * selection. Making the frame draggable meant giving part of it back to the mouse, and the part
 * has to be the edge.
 *
 * Widening any one of the four bands to span the frame would swallow every click on every card in
 * the group. Nothing would error, nothing would look wrong, and the cards would simply stop
 * answering. So the ring is asserted by sweeping the whole frame rather than by spot-checking it.
 */

// A frame around a 400x300 bounding box of members, which is the shape the constants describe:
// padding all round, plus the header row on top.
const MEMBERS = { w: 400, h: 300 }
const FRAME = {
  w: MEMBERS.w + GROUP_PAD * 2,
  h: MEMBERS.h + GROUP_PAD * 2 + GROUP_HEAD,
}

/** Where the member cards actually sit, in frame-local coordinates. */
const INTERIOR = {
  x0: GROUP_PAD,
  y0: GROUP_HEAD + GROUP_PAD,
  x1: FRAME.w - GROUP_PAD,
  y1: FRAME.h - GROUP_PAD,
}

describe('a group frame’s grab band', () => {
  it('takes every point along all four edges', () => {
    const missed: string[] = []
    for (let x = 0; x < FRAME.w; x += 2) {
      for (const y of [0, GROUP_HEAD, FRAME.h - 1]) if (!onRim(FRAME, x, y)) missed.push(`${x},${y}`)
    }
    for (let y = 0; y < FRAME.h; y += 2) {
      for (const x of [0, FRAME.w - 1]) if (!onRim(FRAME, x, y)) missed.push(`${x},${y}`)
    }
    expect(missed).toEqual([])
  })

  /** The whole top row is the group's title bar, header strip included. */
  it('takes the header row across the full width', () => {
    for (let x = 0; x < FRAME.w; x += 2) {
      expect(onRim(FRAME, x, GROUP_HEAD / 2)).toBe(true)
      expect(onRim(FRAME, x, GROUP_HEAD + GROUP_PAD - 1)).toBe(true)
    }
  })

  /**
   * THE ONE THAT MATTERS. Every point where a card can sit must fall through to the card.
   */
  it('takes nothing where the cards are', () => {
    const swallowed: string[] = []
    for (let x = INTERIOR.x0; x < INTERIOR.x1; x += 2) {
      for (let y = INTERIOR.y0; y < INTERIOR.y1; y += 2) {
        if (onRim(FRAME, x, y)) swallowed.push(`${x},${y}`)
      }
    }
    expect(swallowed).toEqual([])
  })

  it('leaves a real interior to fall through, on a frame this size', () => {
    expect(INTERIOR.x1 - INTERIOR.x0).toBe(MEMBERS.w)
    expect(INTERIOR.y1 - INTERIOR.y0).toBe(MEMBERS.h)
  })

  /** Four bands, one per edge, each pinned to the side it names. */
  it('pins each band to its own edge', () => {
    expect(GROUP_RIMS.map((r) => r.edge)).toEqual(['top', 'bottom', 'left', 'right'])
    for (const { edge, style } of GROUP_RIMS) {
      expect(style[edge]).toBe(0)
      // A band runs a fixed distance in from its edge; it never spans the axis it measures.
      expect(edge === 'top' || edge === 'bottom' ? style.height : style.width).toBeGreaterThan(0)
    }
  })

  /**
   * THE OTHER BOARD SCALES ITS FRAME BY THE ZOOM, so the ring has to hold at whatever padding and
   * header it is handed — not just at this module's two constants. Fixed numbers would put the band
   * inside its own border at 50% and outside it at 200%, and at the small end the interior would be
   * swallowed: a 20px pad at 10% zoom is 2px, and a band still 20px wide covers the cards.
   */
  it('stays a ring at any padding and header, including a zoomed frame', () => {
    for (const [pad, head] of [[20, 26], [2, 2.6], [40, 52], [0.5, 1]]) {
      const rims = rimsFor(pad, head)
      const frame = { w: MEMBERS.w + pad * 2, h: MEMBERS.h + pad * 2 + head }
      const covers = (x: number, y: number) => rims.some((r) => rimCovers(r.style, frame, x, y))
      // The border it draws is taken...
      expect(covers(0, 0)).toBe(true)
      expect(covers(frame.w - 0.1, frame.h - 0.1)).toBe(true)
      expect(covers(frame.w / 2, head / 2)).toBe(true)
      // ...and the members' own box is not, anywhere in it.
      const swallowed: string[] = []
      for (let x = pad; x < frame.w - pad; x += 5) {
        for (let y = head + pad; y < frame.h - pad; y += 5) if (covers(x, y)) swallowed.push(`${pad}@${x},${y}`)
      }
      expect(swallowed).toEqual([])
    }
  })
})
