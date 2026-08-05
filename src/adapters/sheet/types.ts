import type { RowStatus, TrafficRow } from '../../domain/types'

/**
 * The sheet is the source of truth. This interface is the only thing the app
 * knows about it — swap MockSheetAdapter for a GoogleSheetsAdapter or
 * AirtableAdapter later without touching the UI or store.
 *
 * All methods are async so a real (network-backed) implementation drops in
 * cleanly.
 */
export interface SheetAdapter {
  /** Read every row currently in the sheet. */
  list(): Promise<TrafficRow[]>
  /**
   * The same read, synchronously, for adapters that can answer without waiting — only the
   * localStorage-backed one can. The store uses it to SEED `rows` at creation, so the very first
   * paint already has the workspace in it.
   *
   * Without a seed the first paint always ran on `rows: []`, because `refresh()` is kicked off
   * from an effect and effects run after paint. Every rows-driven surface therefore rendered its
   * "you have nothing" state for a frame or more before the real content replaced it: the
   * Campaigns page flashed "0 campaigns / Start a campaign", and a campaign board flashed empty
   * before its cards and their channels appeared.
   *
   * Optional on purpose: a network-backed adapter genuinely cannot answer synchronously and
   * leaves it undefined, which is what `rowsHydrated` is for.
   */
  listSync?(): TrafficRow[]
  /** Append draft rows produced by the scheduler. */
  append(rows: TrafficRow[]): Promise<void>
  /** Patch a single row (status change, time edit, caption edit). */
  update(id: string, patch: Partial<TrafficRow>): Promise<void>
  /** Bulk status transition (e.g. approve all drafts). */
  setStatus(ids: string[], status: RowStatus): Promise<void>
  /** Remove a row. */
  remove(id: string): Promise<void>
  /** Wipe everything (used by the "clear" action / tests). */
  clear(): Promise<void>
  /** Replace the whole sheet in one shot (used by undo). */
  replaceAll(rows: TrafficRow[]): Promise<void>
}
