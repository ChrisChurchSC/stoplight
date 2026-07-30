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
    const client = supabase
    // Chunk so a big backfill (hundreds of rows / MBs of jsonb) doesn't exceed the request size
    // limit or time out as one statement. Upsert on id so a re-run doesn't duplicate. The chunks are
    // independent statements, so they go out together instead of one round trip at a time.
    const CHUNK = 200
    const sends: Promise<void>[] = []
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((r) => this.record(ws, r))
      const n = i / CHUNK
      sends.push(
        (async () => {
          const { error } = await client.from('assets').upsert(batch, { onConflict: 'id' })
          if (error) throw new Error(`assets insert failed (batch ${n}): ${error.message}`)
        })(),
      )
    }
    await Promise.all(sends)
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

  /**
   * Patch many rows in one round trip. Not part of SheetAdapter: the store feature-detects it and
   * keeps its per-id loop for the localStorage mock, where a write costs nothing. Approving or
   * editing a multi-row selection used to be one sequential request per row.
   */
  async updateMany(updates: { id: string; patch: Partial<TrafficRow> }[]): Promise<void> {
    const ws = await getActiveWorkspaceId()
    if (!ws || !supabase || updates.length === 0) return
    // Collapse repeats first so the last patch for an id wins, exactly as the sequential loop did.
    const byId = new Map<string, Partial<TrafficRow>>()
    for (const u of updates) byId.set(u.id, { ...byId.get(u.id), ...u.patch })
    const ids = [...byId.keys()]
    const CHUNK = 200
    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = await this.merged(ids.slice(i, i + CHUNK), (r, id) => ({ ...r, ...byId.get(id) }))
      if (batch.length) await this.writeBatch(batch)
    }
  }

  async setStatus(ids: string[], status: RowStatus): Promise<void> {
    const ws = await getActiveWorkspaceId()
    if (!ws || !supabase || ids.length === 0) return
    const stamp = Date.now()
    // Chunked for the same reason append() is: a full TrafficRow carries its messaging map, body,
    // extracted copy, references and rtbMap, so approving a few hundred at once is a multi-megabyte
    // POST that a 413 or a statement timeout will reject outright. Unchunked, one oversized request
    // failed every row in the selection; before batching existed at all, a bad row failed alone.
    const CHUNK = 200
    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = await this.merged(ids.slice(i, i + CHUNK), (r) => {
        const next: TrafficRow = { ...r, status }
        if (status === 'approved') next.approvedAt = stamp
        if (status === 'posted') next.postedAt = stamp
        return next
      })
      if (batch.length) await this.writeBatch(batch)
    }
  }

  /**
   * One upsert, with the error actually looked at.
   *
   * postgrest-js does not reject on a failed request unless shouldThrowOnError is set, and it is
   * not set anywhere here: it resolves with { error } and a null body. So `await supabase.from(…)
   * .upsert(…)` on its own swallows every failure, the caller returns as though it succeeded, and
   * the store's refresh() then re-reads the server and snaps the rows back to their old values with
   * nothing shown to the person who just approved them. Throwing is what lets a caller notice.
   */
  private async writeBatch(batch: Record<string, unknown>[]): Promise<void> {
    if (!supabase) return
    const { error } = await supabase.from('assets').upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`assets upsert failed: ${error.message}`)
  }

  /**
   * Read the named rows, apply `next` to each, and return upsert records for the ones that exist.
   * The read is needed either way (the patch merges into the stored jsonb), and once every row is in
   * memory a single upsert replaces the write-per-id loop these paths used to run.
   *
   * Each record keeps the workspace_id it was read with rather than the caller's active workspace,
   * so an upsert can never migrate a row between workspaces the way a blanket stamp could.
   */
  private async merged(ids: string[], next: (row: TrafficRow, id: string) => TrafficRow) {
    if (!supabase) return []
    const { data } = await supabase.from('assets').select('id, row, workspace_id').in('id', ids)
    return (data ?? []).map((rec) => ({
      ...this.record(rec.workspace_id as string, next(rec.row as TrafficRow, rec.id as string)),
      // The primary key stays whatever the column says, in case a row's jsonb copy of it drifted.
      id: rec.id as string,
    }))
  }

  async remove(id: string): Promise<void> {
    if (!supabase) return
    await supabase.from('assets').delete().eq('id', id)
  }

  /**
   * Delete many ids as one statement (see updateMany for why this isn't on SheetAdapter). Deleting a
   * selection row by row was both slow and only half-atomic: a failure partway through left an
   * unpredictable subset behind, which one `in` filter can't do.
   */
  async removeMany(ids: string[]): Promise<void> {
    if (!supabase || ids.length === 0) return
    // Chunked because the id list travels in the query string, which has a length ceiling.
    const CHUNK = 200
    for (let i = 0; i < ids.length; i += CHUNK) {
      await supabase.from('assets').delete().in('id', ids.slice(i, i + CHUNK))
    }
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
