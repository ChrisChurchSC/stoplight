import { describe, expect, it } from 'vitest'
import {
  MAX_DOC_BYTES,
  MAX_DOC_CHARS,
  clampDoc,
  describeDoc,
  docFromPaste,
  isDocFile,
  readCardDoc,
} from '../cardDoc'

/**
 * READING A DOCUMENT ONTO A CARD.
 *
 * The refusals are the point. Everything this accepts is sent to a model and written into a record
 * the user is then told to check, so the two failures that matter are a binary read as prose (a
 * renamed PDF fills a card with mojibake) and a body cut mid-sentence (half a claim reaches the
 * writer as a whole one).
 */

const file = (name: string, body: string, type = ''): File => new File([body], name, { type })

describe('what reads as a document', () => {
  it('takes markdown and plain text by extension', () => {
    for (const n of ['brief.md', 'BRIEF.MD', 'notes.markdown', 'page.mdx', 'persona.txt'])
      expect(isDocFile(file(n, 'x'))).toBe(true)
  })

  it('takes a typed file with no useful extension', () => {
    expect(isDocFile(file('brief', 'x', 'text/markdown'))).toBe(true)
    expect(isDocFile(file('brief', 'x', 'text/plain'))).toBe(true)
  })

  it('refuses a table, which belongs on a Data source card', () => {
    expect(isDocFile(file('rows.csv', 'a,b', 'text/csv'))).toBe(false)
    expect(isDocFile(file('rows.tsv', 'a\tb'))).toBe(false)
  })

  it('refuses a binary whatever it is called', () => {
    expect(isDocFile(file('deck.pdf', 'x', 'application/pdf'))).toBe(false)
    expect(isDocFile(file('brief.docx', 'x'))).toBe(false)
  })
})

describe('clamping', () => {
  it('leaves a document that fits exactly as it is', () => {
    const t = '# Brief\n\nA short one.'
    expect(clampDoc(t)).toBe(t)
  })

  it('cuts at a paragraph break rather than mid-sentence', () => {
    const para = `${'a'.repeat(60)}\n\n`
    const out = clampDoc(para.repeat(10), 200)
    expect(out.length).toBeLessThanOrEqual(200)
    // Ends on a whole paragraph: the cut landed on the break, not inside the run of a's.
    expect(out.endsWith('a')).toBe(true)
    expect(out.split('\n\n').every((p) => p.length === 60)).toBe(true)
  })

  it('settles for a line break when there is no paragraph to cut at', () => {
    const out = clampDoc(`${'b'.repeat(40)}\n`.repeat(10), 200)
    expect(out.length).toBeLessThanOrEqual(200)
    expect(out.split('\n').every((l) => l.length === 40)).toBe(true)
  })

  it('still cuts when the document is one long line with nowhere to break', () => {
    const out = clampDoc('c'.repeat(1000), 200)
    expect(out).toHaveLength(200)
  })
})

describe('reading a file', () => {
  it('reads a markdown file and reports its length', async () => {
    const doc = await readCardDoc(file('brief.md', '# Positioning\n\nWe sell to ops teams.\n'))
    expect(doc.name).toBe('brief.md')
    expect(doc.text).toBe('# Positioning\n\nWe sell to ops teams.')
    expect(doc.sourceChars).toBe(doc.text.length)
  })

  it('refuses a file that is not markdown or text', async () => {
    await expect(readCardDoc(file('deck.pdf', 'anything', 'application/pdf'))).rejects.toThrow(/\.md or \.txt/)
  })

  it('refuses a renamed binary, which passes every test on its name', async () => {
    const nul = String.fromCharCode(0)
    await expect(readCardDoc(file('brief.md', `%PDF-1.7${nul}${nul}garbage`))).rejects.toThrow(/not text/)
  })

  it('refuses an empty file rather than filling a card from nothing', async () => {
    await expect(readCardDoc(file('brief.md', '   \n\n  '))).rejects.toThrow(/empty/)
  })

  it('refuses a file too big to be a brief, before reading it', async () => {
    const big = file('brief.md', 'x')
    Object.defineProperty(big, 'size', { value: MAX_DOC_BYTES + 1 })
    await expect(readCardDoc(big)).rejects.toThrow(/too big/)
  })

  it('clamps an overlong file and remembers how long it really was', async () => {
    const body = `${'d'.repeat(80)}\n`.repeat(500)
    const doc = await readCardDoc(file('long.md', body))
    expect(doc.text.length).toBeLessThanOrEqual(MAX_DOC_CHARS)
    expect(doc.sourceChars).toBe(body.trim().length)
    expect(doc.sourceChars).toBeGreaterThan(doc.text.length)
  })
})

describe('a pasted body', () => {
  it('becomes a named document rather than an anonymous one', () => {
    const doc = docFromPaste('  Our audience is heads of RevOps at Series B companies.  ')
    expect(doc.name).toBe('Pasted text')
    expect(doc.text).toBe('Our audience is heads of RevOps at Series B companies.')
  })
})

describe('what the chip says', () => {
  it('names the file and its length', () => {
    expect(describeDoc({ name: 'brief.md', text: 'x'.repeat(1200), sourceChars: 1200 }))
      .toBe('brief.md · 1,200 characters')
  })

  it('says so when it could not take the whole thing', () => {
    expect(describeDoc({ name: 'brief.md', text: 'x'.repeat(1200), sourceChars: 9000 }))
      .toBe('brief.md · first 1,200 of 9,000 characters')
  })
})
