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

/**
 * WHERE A DOCUMENT LIVES, now that three things can hold one.
 *
 * A RECORD holds the canonical document: this is what a Voice, an Audience or an Account IS, and it
 * is true of that record everywhere the record is named. Attaching a .md to a card writes it here,
 * because a brief describing an audience does not stop being true on the next campaign.
 *
 * A CARD may hold one that OVERRIDES the record's, for its own board only. That is the "this
 * campaign reads the persona differently" case, and it has to be a separate slot rather than an
 * edit: writing it onto the record would silently rewrite what every other campaign is generated
 * from, which is the one failure a shared library cannot recover from.
 *
 * A SMART OBJECT holds one describing the bundle, which is a different subject and stays as it was.
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

/** Long enough to be a title, short enough to sit in a Records cell without pushing every column. */
const MAX_TITLE = 60

/**
 * A NAME FOR THE RECORD A DOCUMENT JUST CREATED.
 *
 * Handing a card a .md mints the object it describes, and an object with no name is the thing this
 * was supposed to stop producing: a row in Records reading "Untitled" that nobody can identify well
 * enough to reuse, which is most of the value of putting it in a library at all.
 *
 * The document's own H1 first, because a brief that opens "# Enterprise ops lead" has already been
 * given a name by the person who wrote it, and any name derived from a filename is a worse guess
 * than the one they typed. The filename second, tidied: "persona-enterprise-ops.md" is a real
 * answer, "persona enterprise ops" is a readable one. A pasted body has no filename worth showing,
 * so it falls through to its first line.
 *
 * NEVER EMPTY, and never the literal placeholder: a caller that gets "" back would write a nameless
 * record and we would be where we started. The last resort is the honest, visibly-renameable
 * placeholder ensureAudienceFor already uses for the same reason.
 */
export function titleFromDoc(fileName: string, text: string, fallback = 'Untitled'): string {
  const clean = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE).trim()
  // Only the opening of the document: a "# " thirty screens down is a section, not the subject.
  for (const line of text.split('\n', 40)) {
    const h = /^#{1,2}\s+(.+?)\s*#*$/.exec(line.trim())
    // Strip the marks a heading may still carry, so "# **Enterprise ops**" is not named with asterisks.
    if (h) { const t = clean(h[1].replace(/[*_`]/g, '')); if (t) return t }
  }
  const named = fileName.replace(/\.(md|markdown|mdx|txt|text)$/i, '').replace(/[-_]+/g, ' ')
  // "Pasted text" is this app's word for "no filename", so it is not a title, it is the absence of one.
  if (named.trim() && named.trim().toLowerCase() !== 'pasted text') {
    const t = clean(named)
    return t.charAt(0).toUpperCase() + t.slice(1)
  }
  const first = clean(text.split('\n').find((l) => l.trim())?.replace(/^[#>*\-\s]+/, '') ?? '')
  return first || fallback
}

/**
 * WHICH DOCUMENT A CARD IS ACTUALLY READ FROM, and which of the two slots it came from.
 *
 * The card wins, by the rule stated at the top of this file. It lives here rather than at each call
 * site because there are three of them and they must not disagree: a precedence that resolves one
 * way in the inspector and the other way in the copy request is a card that shows you one brief and
 * generates from another, and nothing on screen would say so.
 *
 * `from` is returned rather than inferred by the caller so the UI can say which one it is showing.
 * A document you cannot tell the origin of is exactly the confusion an override introduces.
 */
export function pickReference(
  cardRef: ObjectReference | undefined,
  recordRef: ObjectReference | undefined,
): { ref: ObjectReference; from: 'card' | 'record' } | null {
  if (cardRef?.text.trim()) return { ref: cardRef, from: 'card' }
  if (recordRef?.text.trim()) return { ref: recordRef, from: 'record' }
  return null
}
