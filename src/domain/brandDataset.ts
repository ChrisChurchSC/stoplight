import { freshRecordId } from './records'

/**
 * A brand "data set" — the flexible half of the hybrid brand model. Where the preset brand basics
 * feed Gretel's generation, a data set is a blank spreadsheet the user fills out however they like
 * (competitor research, campaign learnings, whatever). Free-form on purpose: columns and rows are
 * just labelled strings, so nothing here is assumed to be AI-legible. Stored per brand.
 */
export interface BrandDataset {
  id: string
  brand: string
  name: string
  columns: string[]
  rows: string[][]
}

const DEFAULT_COLS = 4
const DEFAULT_ROWS = 6

export function freshDatasetId(): string {
  return freshRecordId('ds')
}

/** A blank spreadsheet: a few labelled columns and empty rows, ready to fill. */
export function blankDataset(brand: string, name: string): BrandDataset {
  return {
    id: freshDatasetId(),
    brand,
    name: name.trim() || 'Untitled data set',
    columns: Array.from({ length: DEFAULT_COLS }, (_, i) => `Column ${i + 1}`),
    rows: Array.from({ length: DEFAULT_ROWS }, () => Array.from({ length: DEFAULT_COLS }, () => '')),
  }
}

/** Normalize a grid so every row has exactly columns.length cells (pad/trim on read + write). */
export function squareRows(columns: string[], rows: string[][]): string[][] {
  return rows.map((r) => Array.from({ length: columns.length }, (_, c) => r[c] ?? ''))
}
