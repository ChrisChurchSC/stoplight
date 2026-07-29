/**
 * Parse a delimited text file (CSV, TSV) into a grid.
 *
 * WRITTEN OUT RATHER THAN PULLED IN. This project has five production dependencies, and a real CSV
 * parser is about eighty lines once you handle quoting properly. The half that people skip — quoted
 * fields containing the delimiter, escaped quotes, newlines inside a quoted cell — is exactly the
 * half that a marketing export hits, because ad copy and page titles are full of commas.
 *
 * What it handles: RFC 4180 quoting (`"a,b"`, `""` as a literal quote, newlines inside quotes),
 * delimiter sniffing across comma / tab / semicolon, CRLF, and a UTF-8 BOM (which Excel writes and
 * which otherwise turns the first column header into `﻿Date`).
 *
 * What it does not: .xlsx. That is a zip of XML and genuinely needs a library. Excel's own
 * "Save as CSV" is the supported route until that dependency is a decision somebody has made.
 */

export interface ParsedTable {
  columns: string[]
  rows: string[][]
  /** What the sniffer settled on, so the UI can say when it guessed unusually. */
  delimiter: ',' | '\t' | ';'
  /** Rows dropped for being entirely empty, worth reporting rather than silently swallowing. */
  skippedBlankRows: number
}

const DELIMS = [',', '\t', ';'] as const

/**
 * Pick the delimiter by counting candidates OUTSIDE quotes on the first few lines.
 *
 * Counting naively is how a file whose first cell is `"Smith, John"` gets read as comma-delimited
 * when it is tab-delimited. Ties go to comma, being overwhelmingly the common case.
 */
function sniffDelimiter(text: string): ',' | '\t' | ';' {
  const sample = text.slice(0, 64_000)
  const counts = new Map<string, number>(DELIMS.map((d) => [d, 0]))
  let quoted = false
  let lines = 0
  for (let i = 0; i < sample.length && lines < 5; i++) {
    const ch = sample[i]
    if (ch === '"') {
      if (quoted && sample[i + 1] === '"') i++
      else quoted = !quoted
      continue
    }
    if (quoted) continue
    if (ch === '\n') { lines++; continue }
    if (counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  let best: ',' | '\t' | ';' = ','
  let bestN = counts.get(',') ?? 0
  for (const d of DELIMS) {
    const n = counts.get(d) ?? 0
    if (n > bestN) { best = d; bestN = n }
  }
  return best
}

/** Split delimited text into a raw grid, honouring RFC 4180 quoting. */
function splitGrid(text: string, delim: string): string[][] {
  const grid: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        // A doubled quote inside a quoted cell is a literal quote, not the end of it.
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === delim) { row.push(cell); cell = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(cell); grid.push(row); row = []; cell = ''; continue }
    cell += ch
  }
  // Whatever is in hand at EOF is a final cell, unless the file ended on a clean newline.
  if (cell !== '' || row.length) { row.push(cell); grid.push(row) }
  return grid
}

export function parseTable(raw: string): ParsedTable {
  // Excel writes a BOM. Left in place it becomes part of the first header, which then matches
  // nothing downstream and is invisible on screen.
  const text = raw.replace(/^﻿/, '')
  const delimiter = sniffDelimiter(text)
  const grid = splitGrid(text, delimiter)

  const nonEmpty = grid.filter((r) => r.some((c) => c.trim() !== ''))
  const skippedBlankRows = grid.length - nonEmpty.length
  if (!nonEmpty.length) return { columns: [], rows: [], delimiter, skippedBlankRows }

  const width = nonEmpty.reduce((w, r) => Math.max(w, r.length), 0)
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => (r[i] ?? '').trim())

  // The first row is the header. A blank header cell still needs a name, or the column cannot be
  // referred to at all; numbering them is more honest than inventing one.
  const header = pad(nonEmpty[0]).map((h, i) => h || `Column ${i + 1}`)
  const rows = nonEmpty.slice(1).map(pad)
  return { columns: header, rows, delimiter, skippedBlankRows }
}

/** Is this a file we can read? .xlsx deliberately excluded — see the note at the top. */
export const isParsableTableFile = (name: string): boolean => /\.(csv|tsv|txt)$/i.test(name.trim())
