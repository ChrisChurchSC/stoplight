import { getActiveWorkspaceId } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import type { RecordAdapter } from './types'

/**
 * A record list persisted to its own Supabase table, scoped to the signed-in user's workspace.
 * Each table follows the assets/messages shape: (id, workspace_id, name, data jsonb, updated_at),
 * with the full record in `data` so the app's shape can evolve without a migration. RLS ties every
 * read/write to workspace membership (see supabase/schema.sql). No-ops safely when the workspace
 * isn't resolved yet, so an early call can't throw.
 *
 * EVERY METHOD THROWS ON A FAILED REQUEST. postgrest-js does not reject unless shouldThrowOnError
 * is set; it resolves with { error } and a null body. So `await supabase.from(t).insert(x)` on its
 * own swallows every failure and the caller returns as though it worked. That is not hypothetical
 * here: `products`, `brand_objects` and `library_folders` were mirrored to tables that had never
 * been created, and because the writes were discarded promises against a silent client, the app
 * reported success for months. A missing table now surfaces at the call site (see saveRecordList,
 * which logs it) instead of looking exactly like an empty one.
 */
export class SupabaseRecordAdapter<T extends { id: string; name?: string }> implements RecordAdapter<T> {
  constructor(private table: string) {}

  private row(r: T, ws: string) {
    return { id: r.id, workspace_id: ws, name: r.name ?? null, data: r, updated_at: new Date().toISOString() }
  }

  private fail(op: string, message: string): never {
    throw new Error(`${this.table}.${op} failed: ${message}`)
  }

  /**
   * Throws rather than returning [] on error, so a caller can tell "this workspace has no records"
   * apart from "this read did not happen". hydrateRecords depends on the difference: patching an
   * empty list over a slice because the request failed is how a missing table erased the folders a
   * user had already created.
   */
  async list(): Promise<T[]> {
    if (!supabase) return []
    const ws = await getActiveWorkspaceId()
    if (!ws) return []
    const { data, error } = await supabase.from(this.table).select('data').eq('workspace_id', ws)
    if (error) this.fail('list', error.message)
    return (data ?? []).map((r) => (r as { data: T }).data)
  }
  async upsert(record: T): Promise<void> {
    if (!supabase) return
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    const { error } = await supabase.from(this.table).upsert(this.row(record, ws))
    if (error) this.fail('upsert', error.message)
  }
  async remove(id: string): Promise<void> {
    if (!supabase) return
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    const { error } = await supabase.from(this.table).delete().eq('workspace_id', ws).eq('id', id)
    if (error) this.fail('remove', error.message)
  }
  async replaceAll(records: T[]): Promise<void> {
    if (!supabase) return
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    const { error: delError } = await supabase.from(this.table).delete().eq('workspace_id', ws)
    if (delError) this.fail('replaceAll', delError.message)
    if (!records.length) return
    const { error } = await supabase.from(this.table).insert(records.map((r) => this.row(r, ws)))
    if (error) this.fail('replaceAll', error.message)
  }
}
