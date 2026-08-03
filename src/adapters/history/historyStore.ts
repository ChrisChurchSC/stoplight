import type { AuditEntry } from '../../domain/breaks'
import type { CampaignVersion } from '../../domain/versions'
import { getActiveWorkspaceId } from '../../lib/session'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

/**
 * The audit trail and campaign version history, persisted to the workspace.
 *
 * Both were localStorage-only: an audit trail that lives in one person's browser is not an audit
 * trail, and neither survives clearing site data. Both are also pure APPENDS — an entry is written
 * once and never edited — so they deliberately do NOT go through SupabaseRecordAdapter, whose
 * replaceAll() is a delete-then-insert of the entire list. Rewriting the whole trail on every
 * action would be wasteful, and worse, racy: two devices appending at once would each replace the
 * table with their own view of it and one would lose the other's entries. One insert per entry has
 * neither problem, and matches the append-only RLS on the tables (see supabase/migrations/0010).
 *
 * Follows the metricSnapshots pattern: localStorage always holds a copy (cache / offline / no
 * backend), Supabase is the shared truth when one is configured.
 */

const AUDIT_KEY = 'stoplight.auditLog.v1'
const VERSIONS_KEY = 'stoplight.versions.v1'

/**
 * How many entries the local cache keeps. The server keeps everything; this bound exists because
 * localStorage has a hard quota and a full trail would eventually blow it, taking every other
 * key's write down with it. Newest are kept — the tail is what anyone reads.
 */
const LOCAL_CAP = 2000

function readLocal<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function writeLocal<T>(key: string, list: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, LOCAL_CAP)))
  } catch {
    /* ignore quota — the server copy is the durable one */
  }
}

/** Newest first, the order both lists are held and rendered in. */
const newestFirst = <T>(list: T[], at: (x: T) => number): T[] => [...list].sort((a, b) => at(b) - at(a))

// ── Audit log ───────────────────────────────────────────────────────────────

export function loadAuditLogLocal(): AuditEntry[] {
  return readLocal<AuditEntry>(AUDIT_KEY)
}

/**
 * Append one entry. Writes the local cache synchronously (so the UI has it before the round trip)
 * and inserts the row when a backend is configured.
 *
 * Fire-and-forget by design — an audit write must never block or fail the action it is recording —
 * but errors are reported to the console rather than swallowed, because "the trail silently stopped
 * recording" is precisely the failure this table exists to make impossible.
 */
export async function appendAuditEntry(entry: AuditEntry, cached: AuditEntry[]): Promise<void> {
  writeLocal(AUDIT_KEY, cached)
  if (!isSupabaseConfigured || !supabase) return
  try {
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    const { error } = await supabase.from('audit_log').insert({
      id: entry.id,
      workspace_id: ws,
      break_id: entry.breakId,
      action: entry.action,
      actor: entry.actor,
      at: entry.at,
      data: entry,
    })
    if (error) console.warn('[audit] entry not persisted:', error.message)
  } catch (e) {
    console.warn('[audit] entry not persisted:', e)
  }
}

/** The workspace's trail, newest first. Falls back to the local cache when there's no backend. */
export async function listAuditLog(): Promise<AuditEntry[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const ws = await getActiveWorkspaceId()
      if (ws) {
        const { data, error } = await supabase
          .from('audit_log')
          .select('data')
          .eq('workspace_id', ws)
          .order('at', { ascending: false })
          .limit(5000)
        if (!error && data) {
          const list = data.map((r) => (r as { data: AuditEntry }).data)
          writeLocal(AUDIT_KEY, list)
          return list
        }
      }
    } catch {
      /* fall through to the local cache */
    }
  }
  return newestFirst(loadAuditLogLocal(), (e) => e.at)
}

// ── Campaign versions ───────────────────────────────────────────────────────

export function loadVersionsLocal(): CampaignVersion[] {
  return readLocal<CampaignVersion>(VERSIONS_KEY)
}

/** Append one save point. Same contract as appendAuditEntry. */
export async function appendCampaignVersion(
  version: CampaignVersion,
  cached: CampaignVersion[],
): Promise<void> {
  writeLocal(VERSIONS_KEY, cached)
  if (!isSupabaseConfigured || !supabase) return
  try {
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    const { error } = await supabase.from('campaign_versions').insert({
      id: version.id,
      workspace_id: ws,
      client: version.client,
      label: version.label,
      author: version.author,
      ts: version.ts,
      data: version,
    })
    if (error) console.warn('[versions] save point not persisted:', error.message)
  } catch (e) {
    console.warn('[versions] save point not persisted:', e)
  }
}

/** The workspace's save points, newest first. */
export async function listCampaignVersions(): Promise<CampaignVersion[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const ws = await getActiveWorkspaceId()
      if (ws) {
        const { data, error } = await supabase
          .from('campaign_versions')
          .select('data')
          .eq('workspace_id', ws)
          .order('ts', { ascending: false })
          .limit(2000)
        if (!error && data) {
          const list = data.map((r) => (r as { data: CampaignVersion }).data)
          writeLocal(VERSIONS_KEY, list)
          return list
        }
      }
    } catch {
      /* fall through to the local cache */
    }
  }
  return newestFirst(loadVersionsLocal(), (v) => v.ts)
}

/**
 * Drop every save point for a brand. The one non-append operation, and the reason
 * campaign_versions grants delete where audit_log does not: deleting a brand purges its history
 * with it. Without this the purge would succeed locally and leave the rows on the server, and a
 * fresh device would hydrate the deleted brand's versions straight back.
 */
export async function removeVersionsForClient(client: string, remaining: CampaignVersion[]): Promise<void> {
  writeLocal(VERSIONS_KEY, remaining)
  if (!isSupabaseConfigured || !supabase) return
  try {
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    const { error } = await supabase
      .from('campaign_versions')
      .delete()
      .eq('workspace_id', ws)
      .eq('client', client)
    if (error) console.warn('[versions] purge not persisted:', error.message)
  } catch (e) {
    console.warn('[versions] purge not persisted:', e)
  }
}
