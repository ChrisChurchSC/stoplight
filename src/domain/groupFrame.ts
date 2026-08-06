/**
 * The geometry of a card group's frame: the breathing room drawn around its members' bounding
 * box, the header strip above it that carries the name, and the band around the edge you can
 * grab to move the whole group.
 *
 * Here rather than in CanvasView so the rim can be tested without standing up a canvas, and here
 * rather than in CSS so the band cannot drift from the frame the same constants size.
 */

export const GROUP_PAD = 22
export const GROUP_HEAD = 30

/** Structural, so this module stays free of React. Assignable to CSSProperties. */
export interface RimStyle {
  top?: number
  bottom?: number
  left?: number
  right?: number
  width?: number
  height?: number
}

export type RimEdge = 'top' | 'bottom' | 'left' | 'right'

/**
 * The four edges of the frame, as a grab band.
 *
 * The ring is exactly the padding around the members, so it covers the part of the frame that is
 * visibly the group and nothing else. The top band takes the header strip too, because that whole
 * row reads as the group's title bar.
 *
 * What it deliberately does NOT cover is the interior. The frame is pass-through, and it has to
 * stay that way: a click inside it belongs to the card under the pointer, or to the canvas
 * between cards, where it starts a marquee. Widening any of these four to span the frame would
 * swallow both, and nothing would error.
 */
export const rimsFor = (pad: number, head: number): { edge: RimEdge; style: RimStyle }[] => [
  { edge: 'top', style: { top: 0, left: 0, right: 0, height: head + pad } },
  { edge: 'bottom', style: { bottom: 0, left: 0, right: 0, height: pad } },
  { edge: 'left', style: { top: 0, bottom: 0, left: 0, width: pad } },
  { edge: 'right', style: { top: 0, bottom: 0, right: 0, width: pad } },
]

/**
 * Takes its measurements because the two boards do not share them: the campaign canvas pads by 20
 * with a 26px header and SCALES both by its zoom, so a band fixed at this module's numbers would
 * sit inside its own frame at 50% and hang outside it at 200%. The ring rule is the same on both,
 * and it lives in one place; only the numbers differ.
 */
export const GROUP_RIMS = rimsFor(GROUP_PAD, GROUP_HEAD)

/**
 * Does a rim cover this point, in frame-local coordinates?
 *
 * Mirrors how the browser resolves the absolutely-positioned band: an edge that is pinned on both
 * sides of an axis spans it, otherwise it runs its own width/height in from the side it is pinned
 * to. Used by the tests to assert what the ring does and does not take.
 */
export const rimCovers = (
  style: RimStyle,
  frame: { w: number; h: number },
  px: number,
  py: number,
): boolean => {
  const x0 = style.left ?? (style.right !== undefined && style.width !== undefined ? frame.w - style.right - style.width : 0)
  const x1 = style.right !== undefined && style.left !== undefined ? frame.w - style.right : x0 + (style.width ?? frame.w)
  const y0 = style.top ?? (style.bottom !== undefined && style.height !== undefined ? frame.h - style.bottom - style.height : 0)
  const y1 = style.bottom !== undefined && style.top !== undefined ? frame.h - style.bottom : y0 + (style.height ?? frame.h)
  return px >= x0 && px < x1 && py >= y0 && py < y1
}

/** Is this frame-local point on the grab band? */
export const onRim = (frame: { w: number; h: number }, px: number, py: number): boolean =>
  GROUP_RIMS.some((r) => rimCovers(r.style, frame, px, py))
