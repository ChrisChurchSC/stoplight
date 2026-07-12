import { getActiveWorkspaceId } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import type { RecordAdapter } from './types'

/**
 * A record list persisted to its own Supabase table, scoped to the signed-in user's workspace.
 * Each table follows the assets/messages shape: (id, workspace_id, name, data jsonb, updated_at),
 * with the full record in `data` so the app's shape can evolve without a migration. RLS ties every
 * read/write to workspace membership (see supabase/schema.sql). No-ops safely when the workspace
 * isn't resolved yet, so an early call can't throw.
 */
export class SupabaseRecordAdapter<T extends { id: string; name?: string }> implements RecordAdapter<T> {
  constructor(private table: string) {}

  private row(r: T, ws: string) {
    return { id: r.id, workspace_id: ws, name: r.name ?? null, data: r, updated_at: new Date().toISOString() }
  }

  async list(): Promise<T[]> {
    if (!supabase) return []
    const ws = await getActiveWorkspaceId()
    if (!ws) return []
    const { data } = await supabase.from(this.table).select('data').eq('workspace_id', ws)
    return (data ?? []).map((r) => (r as { data: T }).data)
  }
  async upsert(record: T): Promise<void> {
    if (!supabase) return
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    await supabase.from(this.table).upsert(this.row(record, ws))
  }
  async remove(id: string): Promise<void> {
    if (!supabase) return
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    await supabase.from(this.table).delete().eq('workspace_id', ws).eq('id', id)
  }
  async replaceAll(records: T[]): Promise<void> {
    if (!supabase) return
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    await supabase.from(this.table).delete().eq('workspace_id', ws)
    if (records.length) await supabase.from(this.table).insert(records.map((r) => this.row(r, ws)))
  }
}
