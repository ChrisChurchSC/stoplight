import type { Box } from './alignGuides'

/**
 * EVEN DISTRIBUTION: equalising the gaps between cards somebody has already placed.
 *
 * The guides in alignGuides handle two cards meeting on an edge. This is the other half of tidying
 * a board by hand: three or more cards roughly in a row, at eye-placed spacings that read as
 * carelessness rather than as a decision. Tidy layout re-lays the whole board and takes your
 * placement with it; this keeps every choice you made about ORDER and about where the run starts
 * and ends, and only equalises what is between them.
 *
 * PURE, and unit-agnostic. It is handed boxes and returns a movement per box in whatever units it
 * was given. The canvas measures in screen pixels and stores offsets in canvas units, so the caller
 * divides by the zoom on the way out - the same conversion the drag handler already does. Doing
 * that here would tie the arithmetic to a viewport and make it testable only by dragging something.
 *
 * GAPS, NOT CENTRES. The other reading of "evenly distributed" spaces the centres equally, which is
 * right when every card is the same size and wrong here: an asset card is several times the height
 * of an audience card, so equal centres leaves the tall ones nearly touching while the short ones
 * float in space. Equal gaps is what reads as even on a board of mixed cards.
 *
 * THE ENDS DO NOT MOVE. They define the run. Moving them would mean choosing a new extent for the
 * whole group, which is a different decision from spacing what is inside it, and one nobody asked
 * for by pressing distribute.
 */
export interface Placed extends Box {
  id: string
}

/**
 * How far each box should move along `axis` for the gaps between them to be equal.
 *
 * Zero for the two at the ends, and zero for everything when there are fewer than three: two cards
 * are already evenly distributed, and a distribute that quietly moved one of them would be doing
 * something else under this name.
 */
export function distributeEvenly(boxes: Placed[], axis: 'x' | 'y'): Record<string, number> {
  const out: Record<string, number> = {}
  if (boxes.length < 3) return out

  const start = (b: Placed) => (axis === 'x' ? b.x : b.y)
  const size = (b: Placed) => (axis === 'x' ? b.w : b.h)

  // Sorted by position, tie-broken by id: two cards at the same coordinate must not swap places
  // between one run and the next, or pressing the button twice would move things both times.
  const order = [...boxes].sort((a, b) => start(a) - start(b) || a.id.localeCompare(b.id))
  const first = order[0]
  const last = order[order.length - 1]

  const span = start(last) + size(last) - start(first)
  const filled = order.reduce((n, b) => n + size(b), 0)
  /**
   * Can be NEGATIVE, deliberately. If the cards between the ends are wider than the room between
   * them, an even overlap is the honest answer to "distribute these": it is still even, and it is
   * visibly too tight, which is information. The alternative - refusing, or growing the run - would
   * either do nothing or move the ends, and the ends are what the person chose.
   */
  const gap = (span - filled) / (order.length - 1)

  let cursor = start(first) + size(first) + gap
  for (let i = 1; i < order.length - 1; i++) {
    const b = order[i]
    out[b.id] = cursor - start(b)
    cursor += size(b) + gap
  }
  return out
}
