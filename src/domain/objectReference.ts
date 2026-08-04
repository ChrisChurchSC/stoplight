/**
 * A DOCUMENT SOMEBODY WROTE, standing as the description of the thing it is attached to.
 *
 * Two things carry one: a smart object (see SmartObject.reference) and a card on a board (see
 * CanvasObject.reference). They are the same idea one rung apart — "here is what this thing is, in
 * the words of the person who knows" — so they are one type with one budget and one shape on the
 * wire, and the copy request sends both in the same list. Two near-identical types would drift, and
 * a drift here means a document reaching the writer under rules that were written for the other one.
 *
 * IT LIVES IN ITS OWN MODULE because flowBoard (cards) and smartObject (objects) both need it and
 * smartObject already imports flowBoard. Declaring it in either would make the two depend on each
 * other, which is a thing every future reader would have to unpick.
 */

/** An uploaded document standing as the description of an object or a card. */
export interface ObjectReference {
  /** The uploaded file's name, kept so both the writer and the UI can say where this came from. */
  name: string
  /**
   * The document's full text, MARKDOWN LEFT AS WRITTEN. The headings are the structure, so stripping
   * them to plain text would throw away the one thing that makes a brief readable to the model —
   * and there is nothing to gain by it, since the writer reads markdown perfectly well.
   */
  text: string
  addedAt: number
  /** Set when `text` was cut to REFERENCE_LIMIT, so the UI can say so rather than quietly shipping
   *  two thirds of a brief and letting it read as the whole of one. */
  truncated?: boolean
}

/**
 * How much of a reference document travels to the writer.
 *
 * The draft request is BATCHED (see draftWriter's chunking) and every batch re-sends the whole
 * campaign context, so a document costs once per batch rather than once per generation. Several long
 * files wired across a big campaign is the difference between a request and an incident.
 *
 * 20k characters is roughly five thousand tokens: longer than any brief anybody actually writes,
 * short enough that a few together stay affordable. An overrun is cut and FLAGGED, never silently
 * dropped — a truncation nobody is told about is how a writer ends up confidently missing half.
 */
export const REFERENCE_LIMIT = 20_000

/**
 * Build a reference from an uploaded file's text, trimming to the budget at a paragraph break so the
 * document ends on a whole thought. Cutting mid-sentence reads to the writer as a fact that trails
 * off, which is worse than stopping a paragraph early.
 */
export function makeObjectReference(name: string, raw: string, at: number): ObjectReference {
  const text = raw.trim()
  if (text.length <= REFERENCE_LIMIT) return { name, text, addedAt: at }
  const head = text.slice(0, REFERENCE_LIMIT)
  const brk = head.lastIndexOf('\n\n')
  // Only honour the break if it is not so early that obeying it would throw away more than the limit
  // saved. A document written as one long block has no break to find and is cut flat.
  return { name, text: brk > REFERENCE_LIMIT / 2 ? head.slice(0, brk) : head, addedAt: at, truncated: true }
}
