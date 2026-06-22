import type { TrafficRow } from '../../domain/types'
import { getActiveWorkspaceId } from '../../lib/session'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { mockCommentSource, type Comment, type CommentSource, type Enrichment } from '../comments/mockComments'

/**
 * The unified inbound message store: everything ingested back from every channel
 * (comments / replies / mentions) lands here, linked to the asset it's on. It's
 * the durable counterpart to the outbound copy in `assets`.
 *
 * `sync` pulls the latest from the platform source and (when Supabase is
 * configured) persists every message + its routing state to the `messages` table,
 * so routed leads survive reloads and are shared across the workspace. Without a
 * backend it's in-memory via the mock source, exactly as before. The platform
 * SOURCE is still the mock feed until a real Meta/TikTok/LinkedIn connector lands;
 * the table is the durable store either way.
 */
export interface MessageStore {
  /** Latest inbound messages for the posted rows, persisted, grouped by asset id. */
  sync(rows: TrafficRow[], prev: Record<string, Comment[]>): Promise<Record<string, Comment[]>>
  /** Persist an already-ingested map (e.g. from the Claude engine) to the store. */
  persist(rows: TrafficRow[], map: Record<string, Comment[]>): Promise<void>
  /** Persist a routing/enrichment update to one message. */
  update(rowId: string, commentId: string, patch: Partial<Comment>): Promise<void>
}

/** Carry routing state (Clay enrichment, routed-to-Attio) from a prior copy. */
function carry(fresh: Comment, prior?: Comment): Comment {
  return prior
    ? { ...fresh, clayRouted: prior.clayRouted, enrichment: prior.enrichment, routed: prior.routed }
    : fresh
}

export class MockMessageStore implements MessageStore {
  constructor(private source: CommentSource = mockCommentSource) {}

  async sync(rows: TrafficRow[], prev: Record<string, Comment[]>): Promise<Record<string, Comment[]>> {
    const out: Record<string, Comment[]> = {}
    for (const r of rows) {
      const fetched = await this.source.fetch(r)
      const byId = new Map((prev[r.id] ?? []).map((c) => [c.id, c]))
      out[r.id] = fetched.map((c) => carry(c, byId.get(c.id)))
    }
    return out
  }

  // The store holds the working copy in memory; nothing to persist.
  async persist(): Promise<void> {}
  async update(): Promise<void> {}
}

interface MessageRow {
  id: string
  asset_id: string
  clay_routed: boolean | null
  enrichment: Enrichment | null
  routed: boolean | null
}

function toRecord(ws: string, r: TrafficRow, c: Comment) {
  return {
    id: c.id,
    workspace_id: ws,
    asset_id: r.id,
    campaign: r.campaign ?? null,
    platform: c.platform,
    author: c.author,
    text: c.text,
    ts: c.ts,
    likes: c.likes,
    replies: c.replies,
    sentiment: c.sentiment,
    needs_response: c.needsResponse,
    intent: c.intent,
    clay_routed: !!c.clayRouted,
    enrichment: c.enrichment ?? null,
    routed: !!c.routed,
  }
}

export class SupabaseMessageStore implements MessageStore {
  constructor(private source: CommentSource = mockCommentSource) {}

  async sync(rows: TrafficRow[], _prev: Record<string, Comment[]>): Promise<Record<string, Comment[]>> {
    const ws = await getActiveWorkspaceId()
    if (!ws || !supabase || rows.length === 0) return {}

    // Persisted routing state wins over a fresh pull, so re-syncing never un-routes.
    const assetIds = rows.map((r) => r.id)
    const { data: existing } = await supabase
      .from('messages')
      .select('id, asset_id, clay_routed, enrichment, routed')
      .in('asset_id', assetIds)
    const byId = new Map((existing as MessageRow[] | null)?.map((m) => [m.id, m]) ?? [])

    const out: Record<string, Comment[]> = {}
    const upserts: ReturnType<typeof toRecord>[] = []
    for (const r of rows) {
      const fetched = await this.source.fetch(r)
      out[r.id] = fetched.map((c) => {
        const ex = byId.get(c.id)
        const merged: Comment = ex
          ? { ...c, clayRouted: ex.clay_routed ?? false, enrichment: ex.enrichment ?? undefined, routed: ex.routed ?? false }
          : c
        upserts.push(toRecord(ws, r, merged))
        return merged
      })
    }
    if (upserts.length) await supabase.from('messages').upsert(upserts)
    return out
  }

  async persist(rows: TrafficRow[], map: Record<string, Comment[]>): Promise<void> {
    const ws = await getActiveWorkspaceId()
    if (!ws || !supabase) return
    const rowById = new Map(rows.map((r) => [r.id, r]))
    const upserts: ReturnType<typeof toRecord>[] = []
    for (const [rowId, comments] of Object.entries(map)) {
      const r = rowById.get(rowId)
      if (!r) continue
      for (const c of comments) upserts.push(toRecord(ws, r, c))
    }
    if (upserts.length) await supabase.from('messages').upsert(upserts)
  }

  async update(_rowId: string, commentId: string, patch: Partial<Comment>): Promise<void> {
    if (!supabase) return
    const dbPatch: Record<string, unknown> = {}
    if ('clayRouted' in patch) dbPatch.clay_routed = patch.clayRouted
    if ('enrichment' in patch) dbPatch.enrichment = patch.enrichment ?? null
    if ('routed' in patch) dbPatch.routed = patch.routed
    if (Object.keys(dbPatch).length) await supabase.from('messages').update(dbPatch).eq('id', commentId)
  }
}

export const messageStore: MessageStore = isSupabaseConfigured
  ? new SupabaseMessageStore()
  : new MockMessageStore()
