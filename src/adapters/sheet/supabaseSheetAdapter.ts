import type { RowStatus, TrafficRow } from '../../domain/types'
import { getActiveWorkspaceId } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import type { SheetAdapter } from './types'

/**
 * Real sheet backed by Supabase (the `assets` table), scoped to the signed-in
 * user's workspace. Implements the same interface as MockSheetAdapter, so the
 * store and UI are unaware of the difference. Key columns are kept in sync for
 * querying; the full TrafficRow lives in the `row` jsonb. RLS on the server makes
 * sure a user only ever touches their own workspace's rows.
 */
export class SupabaseSheetAdapter implements SheetAdapter {
  private record(workspaceId: string, r: TrafficRow) {
    // Only pass scheduled_at when it's a parseable timestamp; a malformed value would fail the
    // whole batch insert (timestamptz cast error).
    const sched = r.scheduledAt && !Number.isNaN(Date.parse(r.scheduledAt)) ? r.scheduledAt : null
    return {
      id: r.id,
      workspace_id: workspaceId,
      campaign: r.campaign ?? null,
      channel: r.channel,
      status: r.status,
      scheduled_at: sched,
      row: r,
      updated_at: new Date().toISOString(),
    }
  }

  async list(): Promise<TrafficRow[]> {
    const ws = await getActiveWorkspaceId()
    if (!ws || !supabase) return []
    // PostgREST caps a select at 1000 rows, so page through with .range() until a short page.
    const PAGE = 1000
    const out: TrafficRow[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('assets').select('row').eq('workspace_id', ws).range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      for (const d of data) out.push(d.row as TrafficRow)
      if (data.length < PAGE) break
    }
    return out
  }

  async append(rows: TrafficRow[]): Promise<void> {
    const ws = await getActiveWorkspaceId()
    if (!ws || !supabase || rows.length === 0) return
    // Chunk so a big backfill (hundreds of rows / MBs of jsonb) doesn't exceed the request size
    // limit or time out as one statement. Upsert on id so a re-run doesn't duplicate.
    const CHUNK = 200
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((r) => this.record(ws, r))
      const { error } = await supabase.from('assets').upsert(batch, { onConflict: 'id' })
      if (error) throw new Error(`assets insert failed (batch ${i / CHUNK}): ${error.message}`)
    }
  }

  async update(id: string, patch: Partial<TrafficRow>): Promise<void> {
    const ws = await getActiveWorkspaceId()
    if (!ws || !supabase) return
    const { data } = await supabase.from('assets').select('row').eq('id', id).single()
    if (!data) return
    const merged = { ...(data.row as TrafficRow), ...patch }
    await supabase
      .from('assets')
      .update({
        row: merged,
        status: merged.status,
        campaign: merged.campaign ?? null,
        channel: merged.channel,
        scheduled_at: merged.scheduledAt || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
  }

  async setStatus(ids: string[], status: RowStatus): Promise<void> {
    const ws = await getActiveWorkspaceId()
    if (!ws || !supabase || ids.length === 0) return
    const stamp = Date.now()
    const { data } = await supabase.from('assets').select('id, row').in('id', ids)
    for (const rec of data ?? []) {
      const r = rec.row as TrafficRow
      const next: TrafficRow = { ...r, status }
      if (status === 'approved') next.approvedAt = stamp
      if (status === 'posted') next.postedAt = stamp
      await supabase.from('assets').update({ row: next, status }).eq('id', rec.id as string)
    }
  }

  async remove(id: string): Promise<void> {
    if (!supabase) return
    await supabase.from('assets').delete().eq('id', id)
  }

  async clear(): Promise<void> {
    const ws = await getActiveWorkspaceId()
    if (!ws || !supabase) return
    await supabase.from('assets').delete().eq('workspace_id', ws)
  }

  async replaceAll(rows: TrafficRow[]): Promise<void> {
    await this.clear()
    if (rows.length) await this.append(rows)
  }
}
