import { freshRecordId } from './records'
import type { AggregatorProvider } from './aggregator'

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
  | {
      kind: 'aggregator'
      provider: AggregatorProvider
      service?: string
      query?: string
      syncedAt?: number
      /**
       * The pull hit its row cap, so this table is the top of something rather than all of it.
       * Recorded because a SUM over a truncated table is not a total, and nothing downstream can tell
       * the difference by looking at the rows.
       */
      truncated?: boolean
      rowCount?: number
    }
  | { kind: 'composite'; prompt: string; generatedAt: number }

export interface BrandDataset {
  id: string
  brand: string
  name: string
  columns: string[]
  rows: string[][]
  /** Absent on data sets written before provenance existed; those are manual by definition. */
  source?: DatasetSource
  /**
   * WHEN SOMEBODY TYPED OVER IT, and how many cells they changed.
   *
   * Every cell of every data set is editable, including a pulled one, and until these existed that
   * edit was invisible: you could type 99% into a Search Console CTR cell and the card would go on
   * reading "Search Console, 14 Mar 2026" as though Google had said so. Harmless while nothing read
   * the table, and a false claim in published copy the moment figures started travelling.
   *
   * A touched table is no longer what the source returned, so it stops being citable. It is still
   * useful and still wireable; a number from it just has to be typed into "The figure" by a person
   * who is willing to own it.
   *
   * GUARANTEE HOLDS GOING FORWARD ONLY. Sets edited before this shipped carry no stamp and still
   * read as measured. There is no way to recover that history, and pretending otherwise by marking
   * every existing set as suspect would be its own false claim.
   */
  editedAt?: number
  editedCells?: number
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
