/**
 * COMMENTS ON A CARD: a thread per card, for a team reading a board together.
 *
 * Distinct from the card's own "Team note", and the difference is worth keeping sharp. The note is
 * ONE piece of text that belongs to the card and describes it; a comment is a remark by a person at
 * a time, and a thread of them is a conversation. Neither reaches the copy writer.
 *
 * Stored flat rather than nested on the card. A comment has a different lifetime from the card's
 * content — it survives edits to the instruction, it is authored by someone who may not own the
 * board, and it wants to sync even when nothing about the card itself changed. Nesting them inside
 * CanvasObject would mean every keystroke on an instruction rewrote the thread.
 */

export interface CardComment {
  id: string
  /** The board this card is on, so a thread never follows a card id onto another campaign. */
  campaign: string
  /** The card (or smart-object placement) the thread hangs off. */
  cardId: string
  /** Display name at the time of writing, captured rather than looked up: a comment should still
   *  read correctly after the author leaves the workspace. */
  author: string
  text: string
  at: number
  /** Set when someone marks the thread dealt with, so it can be collapsed without being deleted. */
  resolvedAt?: number
}

export const freshCommentId = (): string =>
  `cmt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

/** One card's thread, oldest first: a conversation reads down the page. */
export const commentsFor = (all: CardComment[], campaign: string, cardId: string): CardComment[] =>
  all.filter((c) => c.campaign === campaign && c.cardId === cardId).sort((a, b) => a.at - b.at)

/** How many UNRESOLVED comments a card carries, for the badge on the card itself. */
export const openCommentCount = (all: CardComment[], campaign: string, cardId: string): number =>
  all.filter((c) => c.campaign === campaign && c.cardId === cardId && !c.resolvedAt).length

/**
 * A short relative time ("just now", "2h", "3d"). Comments are read in sequence, so the gap between
 * them matters more than the wall-clock time any one was written.
 */
export function commentAge(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d`
  return `${Math.round(d / 7)}w`
}
