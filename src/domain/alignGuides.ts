/**
 * ALIGNMENT GUIDES: the lines that appear while you drag a card, and the nudge that makes the edge
 * actually meet.
 *
 * Cards were placed by eye. Eye-placement is fine until two cards are one pixel out, which reads as
 * a mistake rather than a decision — and on a board that is meant to be read as a diagram, "nearly
 * lined up" is noise the reader has to decide about.
 *
 * PURE, and in canvas units. The canvas measures its cards in screen pixels and scales by zoom, so
 * doing this in the component would mean the maths and the coordinate conversion tangled together
 * and testable only by dragging something. The caller converts; this decides.
 *
 * SNAP TO THE NEAREST, ONE PER AXIS. A card can be near several neighbours at once, and applying
 * every near-match would fight itself — the last one wins and the card jumps somewhere nobody
 * pointed at. Each axis takes its single closest candidate, and reports the line to draw for it.
 */

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** A line to draw: which axis it runs along, where it sits, and how far it should reach. */
export interface Guide {
  axis: 'x' | 'y'
  /** The canvas coordinate the line sits at — an x for a vertical line, a y for a horizontal one. */
  at: number
  /** The span it covers, so the line visibly joins the cards it is about rather than crossing the board. */
  from: number
  to: number
}

export interface Alignment {
  /** How far to move the dragged card so the edges meet. Zero on an axis that found nothing. */
  dx: number
  dy: number
  guides: Guide[]
}

/**
 * Whether two sets of guides say the same thing.
 *
 * A drag emits a frame's worth of these several times a second, and handing back a fresh array each
 * time would make the guides a re-render source in their own right — the same trap `rects` fell into
 * and is now careful about. Holding a line still costs nothing.
 */
export function sameGuides(a: Guide[], b: Guide[]): boolean {
  if (a.length !== b.length) return false
  return a.every((g, i) => {
    const o = b[i]
    return o && g.axis === o.axis && g.at === o.at && g.from === o.from && g.to === o.to
  })
}

/** The three places a box can line up on each axis: its near edge, its middle, its far edge. */
const xEdges = (b: Box): number[] => [b.x, b.x + b.w / 2, b.x + b.w]
const yEdges = (b: Box): number[] => [b.y, b.y + b.h / 2, b.y + b.h]

/**
 * The nearest single alignment on one axis, or null.
 *
 * Ties go to the FIRST candidate rather than the last, which makes the result stable: `others` comes
 * from a board in a consistent order, so a card sitting exactly between two neighbours picks the
 * same one every frame instead of flickering between them as the pointer jitters.
 */
function nearest(
  movingEdges: number[],
  others: Box[],
  edgesOf: (b: Box) => number[],
  tolerance: number,
): { shift: number; at: number; boxes: Box[] } | null {
  let best: { shift: number; at: number; boxes: Box[]; distance: number } | null = null
  for (const other of others) {
    for (const target of edgesOf(other)) {
      for (const mine of movingEdges) {
        const distance = Math.abs(target - mine)
        if (distance > tolerance) continue
        if (best && distance >= best.distance) {
          // Same line, another card to draw through — the guide should reach all of them.
          if (best.at === target && distance === best.distance) best.boxes.push(other)
          continue
        }
        best = { shift: target - mine, at: target, boxes: [other], distance }
      }
    }
  }
  return best ? { shift: best.shift, at: best.at, boxes: best.boxes } : null
}

/**
 * Where a dragged box wants to land, and the lines that say why.
 *
 * `tolerance` is in canvas units, so the caller divides its pixel threshold by the zoom — otherwise
 * snapping would get stickier as you zoomed out, which feels like the board resisting you.
 */
export function alignSnap(moving: Box, others: Box[], tolerance: number): Alignment {
  if (tolerance <= 0 || !others.length) return { dx: 0, dy: 0, guides: [] }
  const guides: Guide[] = []

  const x = nearest(xEdges(moving), others, xEdges, tolerance)
  const dx = x ? x.shift : 0
  if (x) {
    // The span is measured AFTER the snap, so the line ends where the card ends up rather than
    // where it was when the frame started.
    const boxes = [{ ...moving, x: moving.x + dx }, ...x.boxes]
    guides.push({
      axis: 'x',
      at: x.at,
      from: Math.min(...boxes.map((b) => b.y)),
      to: Math.max(...boxes.map((b) => b.y + b.h)),
    })
  }

  const y = nearest(yEdges(moving), others, yEdges, tolerance)
  const dy = y ? y.shift : 0
  if (y) {
    const boxes = [{ ...moving, y: moving.y + dy }, ...y.boxes]
    guides.push({
      axis: 'y',
      at: y.at,
      from: Math.min(...boxes.map((b) => b.x)),
      to: Math.max(...boxes.map((b) => b.x + b.w)),
    })
  }

  return { dx, dy, guides }
}
