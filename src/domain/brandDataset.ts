import { freshRecordId } from './records'

/**
 * A brand "data set" — the flexible half of the hybrid brand model. Where the preset brand basics
 * feed Gretel's generation, a data set is a blank spreadsheet the user fills out however they like
 * (competitor research, campaign learnings, whatever). Free-form on purpose: columns and rows are
 * just labelled strings, so nothing here is assumed to be AI-legible. Stored per brand.
 */
/**
 * WHERE A DATA SET CAME FROM.
 *
 * Every acquisition route lands in the same BrandDataset, and this records which one. That is what
 * lets a Data source card point at ONE thing: before this, the card's refId held either a connector
 * id or a dataset id depending on how you had touched it, and the two overwrote each other.
 *
 * It is also the provenance a figure needs. A number with no source and no date is not evidence, and
 * a writer quoting one cannot be defended.
 */
export type DatasetSource =
  | { kind: 'manual' }
  | { kind: 'upload'; filename: string; importedAt: number; rowCount: number }
  // The routes below are planned, not built. Declared here so the shape is settled before three
  // separate features each invent their own.
  | { kind: 'channel'; channel: string; account?: string; syncedAt?: number }
  /**
   * `service` is the PLATFORM the rows came from (google_search_console, youtube_analytics, …),
   * as opposed to `provider`, which is the warehouse they came through. Both are worth keeping: the
   * card shows the platform's mark, because "is this search data or LinkedIn data" is the question
   * you have at a glance, while provenance is the aggregator's name and the date.
   */
  | { kind: 'aggregator'; provider: 'supermetrics' | 'databox' | 'summer'; service?: string; query?: string; syncedAt?: number }
  | { kind: 'composite'; prompt: string; generatedAt: number }

export interface BrandDataset {
  id: string
  brand: string
  name: string
  columns: string[]
  rows: string[][]
  /** Absent on data sets written before provenance existed; those are manual by definition. */
  source?: DatasetSource
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
