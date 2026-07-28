/**
 * A record list (Companies, People, Brands, Objectives, …) behind one interface, so a slice can
 * persist to localStorage (MockRecordAdapter) or a per-type Supabase table (SupabaseRecordAdapter)
 * without the store caring which. Mirrors the SheetAdapter pattern; all methods async so the
 * network-backed one drops in cleanly.
 */
export interface RecordAdapter<T extends { id: string }> {
  /** Every record in this list (workspace-scoped for the Supabase impl). */
  list(): Promise<T[]>
  /** Insert or update one record by id. */
  upsert(record: T): Promise<void>
  /** Remove one record by id. */
  remove(id: string): Promise<void>
  /** Replace the whole list in one shot. */
  replaceAll(records: T[]): Promise<void>
}
