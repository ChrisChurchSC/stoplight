import { describe, expect, it } from 'vitest'
import { escapeRegExp, tidyAfterRemoval, wholeWordPattern } from '../tidyCopy'

/**
 * WHAT A SUGGESTED FIX HANDS BACK AFTER CUTTING A WORD OUT.
 *
 * Six fix-builders removed a term and then tidied with `.replace(/\s{2,}/g,' ').trim()`. That is
 * wrong twice, and applyBreakFix writes the result straight over the asset — so both failures reach
 * a real campaign in one click.
 */

describe('paragraphs survive having a word taken out', () => {
  /**
   * `\s` matches `\n`, so the blank line between two paragraphs is a two-character whitespace run
   * and collapsed to a single space. A body with headings came back as one block of prose.
   */
  it('keeps the blank line between paragraphs', () => {
    expect(tidyAfterRemoval('First para.\n\nSecond para.')).toBe('First para.\n\nSecond para.')
  })

  it('keeps headings on their own lines', () => {
    const body = '## Why it works\n\nBecause it does.\n\n## What it costs\n\nLess than you think.'
    expect(tidyAfterRemoval(body)).toBe(body)
  })

  it('still collapses runs of spaces inside a line', () => {
    expect(tidyAfterRemoval('sit    here')).toBe('sit here')
  })

  it('clears the trailing space a cut leaves before a line break', () => {
    expect(tidyAfterRemoval('one \ntwo')).toBe('one\ntwo')
  })
})

describe('punctuation left stranded by the cut', () => {
  /**
   * The exact case: removing "together" from "sit together, in" leaves ONE space before the comma,
   * so `\s{2,}` never fires and the reviewer is offered "sit , in" as the improvement.
   */
  it('closes the gap the removed word left before a comma', () => {
    expect(tidyAfterRemoval('sit , in')).toBe('sit, in')
  })

  it('handles the other sentence punctuation the same way', () => {
    expect(tidyAfterRemoval('done . next ! really ? yes : ok ;')).toBe('done. next! really? yes: ok;')
  })

  it('removes punctuation stranded at the start of a line, not just mid-sentence', () => {
    // "Together, we win" with the term cut leaves ", we win".
    expect(tidyAfterRemoval(', we win')).toBe('we win')
    expect(tidyAfterRemoval('Line one\n, we win')).toBe('Line one\nwe win')
  })

  it('leaves ordinary punctuation alone', () => {
    expect(tidyAfterRemoval('Hello, world. Really!')).toBe('Hello, world. Really!')
  })
})

describe('removing a term without damaging its neighbours', () => {
  /**
   * detectOffAudience built `new RegExp(hit,'ig')` with no boundaries, so cutting "ops" also gutted
   * "operations". detectContamination always anchored; the two had drifted.
   */
  it('matches whole words only', () => {
    expect('ops and operations'.replace(wholeWordPattern('ops'), '')).toBe(' and operations')
  })

  it('survives a term carrying regex metacharacters', () => {
    expect(() => wholeWordPattern('C++ (fast)')).not.toThrow()
    expect(escapeRegExp('a+b.c')).toBe('a\\+b\\.c')
  })

  it('does not let a metacharacter term match as syntax', () => {
    // Unescaped, "a.c" would match "abc". Escaped, it matches only the literal.
    expect('abc'.replace(wholeWordPattern('a.c'), 'X')).toBe('abc')
    expect('a.c'.replace(wholeWordPattern('a.c'), 'X')).toBe('X')
  })

  it('is case-insensitive, as every call site relied on', () => {
    expect('Ops here'.replace(wholeWordPattern('ops'), '')).toBe(' here')
  })
})

describe('the whole job, end to end', () => {
  it('cuts a word from a multi-paragraph body and leaves it readable', () => {
    const body = 'We sit together, in one room.\n\n## Proof\n\nIt works together, daily.'
    const cut = body.replace(wholeWordPattern('together'), '')
    expect(tidyAfterRemoval(cut)).toBe('We sit, in one room.\n\n## Proof\n\nIt works, daily.')
  })
})
