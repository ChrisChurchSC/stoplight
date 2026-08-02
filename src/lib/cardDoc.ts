/**
 * A DOCUMENT HANDED TO A CARD: a .md file you upload, or a body of text you paste.
 *
 * The third way to start a card, after typing a sentence and scanning a site. It exists because the
 * material is usually already written: a positioning doc, a persona from research, a messaging
 * house, the notes off a kickoff call. Retyping that as "one sentence in your own words" throws away
 * the specifics that make a card worth having, and pasting it into a box built for a sentence had it
 * silently cut at 1200 characters by the server.
 *
 * SEPARATE FROM filesToAssets, which turns a dropped file into a media Asset for trafficking. This
 * reads one text file into a prompt and nothing is stored: the document is a source, not a record.
 * Sharing the code would mean one of the two growing a flag for whether it is ingesting or reading.
 */

export interface CardDoc {
  /** What to call it, in the chip and in the prompt: a filename, or "Pasted text". */
  name: string
  /** The body, already clamped to MAX_DOC_CHARS. */
  text: string
  /** How long the source was BEFORE clamping, so the UI can say what it left behind. */
  sourceChars: number
}

/** The `accept` string for the picker. Kept beside the extension test so the two cannot drift. */
export const DOC_ACCEPT = '.md,.markdown,.mdx,.txt,text/markdown,text/plain'

/**
 * What this reads. Markdown and plain text only, on purpose: a .csv belongs on a Data source card,
 * where it becomes a table you can see rather than prose the model paraphrases, and a .pdf or a
 * .docx is a binary this cannot open at all.
 */
const DOC_EXT = /\.(md|markdown|mdx|txt|text)$/i

/**
 * The most a document may contribute, in characters. Roughly six thousand tokens: enough for a
 * positioning doc or a research summary whole, and short enough that a card fills in seconds rather
 * than costing the price of a whole strategy deck every time somebody drags the wrong file in.
 */
export const MAX_DOC_CHARS = 24_000

/** Refused before it is read at all. A file this size is not a brief, it is a mistake. */
export const MAX_DOC_BYTES = 2_000_000

/**
 * A paste longer than this stops being a description and becomes a document.
 *
 * Below it, what you typed or pasted is a sentence and goes in the box as one. Above it, it is
 * pasted material that deserves to be read whole, so it becomes an attachment you can see and
 * remove: the same move a pasted table already makes on a Data source card. Set at a long
 * paragraph, which is long enough that nobody's two-line description turns into an attachment
 * behind their back and short enough that real pasted material is never quietly truncated.
 */
export const PASTE_AS_DOC_CHARS = 400

/** Would this file be read as a document? Used to filter a drop, which can carry anything. */
export function isDocFile(file: File): boolean {
  if (DOC_EXT.test(file.name)) return true
  // A file with no extension but an honest text type still reads. A type of text/csv does not:
  // that is a table, and it has its own card.
  return file.type === 'text/markdown' || file.type === 'text/plain'
}

/**
 * Trim to the cap at a boundary, preferring the end of a paragraph and settling for the end of a
 * line. Cutting mid-sentence hands the model half a claim, which is the one input worse than none.
 */
export function clampDoc(text: string, max = MAX_DOC_CHARS): string {
  const t = text.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const para = cut.lastIndexOf('\n\n')
  if (para > max * 0.5) return cut.slice(0, para).trim()
  const line = cut.lastIndexOf('\n')
  if (line > max * 0.5) return cut.slice(0, line).trim()
  return cut.trim()
}

/** A pasted body as a document. Named rather than anonymous, so the chip says where it came from. */
export function docFromPaste(text: string): CardDoc {
  return { name: 'Pasted text', text: clampDoc(text), sourceChars: text.trim().length }
}

/** The byte a text file never contains and a renamed binary always does. */
const NUL = String.fromCharCode(0)

/**
 * Read one file into a document, or throw with the sentence to show the person who picked it.
 *
 * Every refusal is checked BEFORE the read where it can be: a 40 MB video should never be pulled
 * into a string to find out it is not markdown. The last check is on the CONTENT, because a renamed
 * PDF passes every test on its name and then arrives as mojibake with a NUL every few bytes.
 */
export async function readCardDoc(file: File): Promise<CardDoc> {
  if (!isDocFile(file)) throw new Error('That has to be a .md or .txt file.')
  if (file.size > MAX_DOC_BYTES) throw new Error('That file is too big to read.')
  const raw = await file.text()
  if (raw.slice(0, 4000).includes(NUL)) throw new Error('That file is not text.')
  const text = raw.trim()
  if (!text) throw new Error('That file is empty.')
  return { name: file.name, text: clampDoc(text), sourceChars: text.length }
}

/** "brief.md · 12,400 characters", or the same plus what it had to leave behind. */
export function describeDoc(doc: CardDoc): string {
  const read = doc.text.length.toLocaleString()
  return doc.sourceChars > doc.text.length
    ? `${doc.name} · first ${read} of ${doc.sourceChars.toLocaleString()} characters`
    : `${doc.name} · ${read} characters`
}
