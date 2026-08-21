/**
 * TIDYING COPY AFTER SOMETHING HAS BEEN CUT OUT OF IT.
 *
 * Six suggested-fix builders across breaks.ts and coherenceChecks.ts remove a word, a placeholder or
 * a phrase from an asset's copy and then hand the result to a human as "the fixed version". Five of
 * them tidied up with `.replace(/\s{2,}/g, ' ').trim()`, which is wrong twice over.
 *
 * IT DESTROYS PARAGRAPHS. `\s` matches newlines, so the blank line between two paragraphs is a
 * two-character whitespace run and collapses to a single space. A body with headings and paragraph
 * breaks comes back as one block of prose — and applyBreakFix writes that straight over the asset.
 *
 * IT STRANDS PUNCTUATION. Removing "together" from "sit together, in" leaves "sit , in": the space
 * that preceded the term survives, the comma abutted the term so nothing separates them, and
 * `\s{2,}` never fires because there is only ONE space. The same cut at the start of a string leaves
 * the sentence opening with a comma.
 *
 * breaks.ts:405 already had the punctuation half of this right. This is that, generalised, with the
 * newline preserved — so the six sites tidy the same way and a seventh cannot get it wrong.
 */
export function tidyAfterRemoval(text: string): string {
  return (
    text
      // Horizontal whitespace only. This is the whole fix for the paragraph problem: \n is left
      // alone, so the shape of the copy survives having a word taken out of it.
      .replace(/[ \t]{2,}/g, ' ')
      // The space the removed term left standing in front of its own punctuation.
      .replace(/[ \t]+([.,!?;:])/g, '$1')
      // A clause that lost its opening leaves punctuation stranded at the start of a line. Bounded
      // to horizontal space on both sides so it cannot eat the newline it is anchored to.
      .replace(/(^|\n)[ \t]*[,;:][ \t]*/g, '$1')
      // Trailing space before a line break, which the cut can leave behind and nothing else clears.
      .replace(/[ \t]+\n/g, '\n')
      .trim()
  )
}

/**
 * A literal string, made safe to drop into a RegExp.
 *
 * detectOffAudience built `new RegExp(hit, 'ig')` straight from workspace vocabulary, so a term
 * carrying a regex metacharacter — a bracket, a plus, a dot — was interpolated as syntax rather
 * than matched as text, and could throw or match the wrong thing entirely.
 */
export function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The pattern that removes a whole word, and only a whole word.
 *
 * detectContamination anchors with `\b` and detectOffAudience did not, so the same "remove this
 * term" idea cut substrings out of unrelated words: removing "ops" from an asset also gutted
 * "operations". Both go through here now, so the two cannot drift apart again.
 */
export function wholeWordPattern(term: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'ig')
}
