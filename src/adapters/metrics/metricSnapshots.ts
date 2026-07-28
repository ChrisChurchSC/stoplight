import type { MetricSnapshot } from '../../domain/metricSnapshot'
import { getActiveWorkspaceId } from '../../lib/session'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

/**
 * Append-only metric time-series. Writes to Supabase `metric_snapshots` when a backend is
 * configured, else a capped localStorage ring (so it still works offline / pre-backend). Never
 * overwrites — every sync adds rows, keeping history for trend + per-persona learning.
 */

const LOCAL_KEY = 'stoplight.metricSnapshots.v1'
const LOCAL_CAP = 8000

function readLocal(): MetricSnapshot[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function writeLocal(list: MetricSnapshot[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(-LOCAL_CAP)))
  } catch {
    /* ignore quota */
  }
}

/** Append snapshots. Fire-and-forget; safe when the table isn't migrated yet (errors swallowed). */
export async function appendSnapshots(snapshots: MetricSnapshot[]): Promise<void> {
  if (!snapshots.length) return
  // Local ring always keeps a copy (cache/offline).
  writeLocal([...readLocal(), ...snapshots])
  if (!isSupabaseConfigured || !supabase) return
  try {
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    const rows = snapshots.map((s) => ({
      workspace_id: ws,
      brand: s.brand,
      scope: s.scope,
      scope_id: s.scopeId,
      campaign: s.campaign ?? null,
      audience: s.audience ?? null,
      metric: s.metric,
      value: s.value,
      unit: s.unit ?? null,
      source: s.source ?? null,
      captured_at: s.capturedAt,
    }))
    await supabase.from('metric_snapshots').insert(rows)
  } catch {
    /* table not migrated yet, or offline — the local ring still has it */
  }
}

/** Read snapshots for a brand (newest first), optionally filtered. For trend + per-persona analysis. */
export async function listSnapshots(
  brand: string,
  filter?: { scope?: MetricSnapshot['scope']; metric?: string; since?: string },
): Promise<MetricSnapshot[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const ws = await getActiveWorkspaceId()
      if (ws) {
        let q = supabase.from('metric_snapshots').select('*').eq('workspace_id', ws).eq('brand', brand)
        if (filter?.scope) q = q.eq('scope', filter.scope)
        if (filter?.metric) q = q.eq('metric', filter.metric)
        if (filter?.since) q = q.gte('captured_at', filter.since)
        const { data } = await q.order('captured_at', { ascending: false }).limit(5000)
        if (data) {
          return data.map((r) => ({
            brand: r.brand as string,
            scope: r.scope as MetricSnapshot['scope'],
            scopeId: r.scope_id as string,
            campaign: (r.campaign as string) ?? undefined,
            audience: (r.audience as string) ?? undefined,
            metric: r.metric as string,
            value: r.value as number,
            unit: (r.unit as string) ?? undefined,
            source: (r.source as string) ?? undefined,
            capturedAt: r.captured_at as string,
          }))
        }
      }
    } catch {
      /* fall through to local */
    }
  }
  return readLocal()
    .filter((s) => s.brand === brand)
    .filter((s) => (filter?.scope ? s.scope === filter.scope : true))
    .filter((s) => (filter?.metric ? s.metric === filter.metric : true))
    .filter((s) => (filter?.since ? s.capturedAt >= filter.since : true))
    .reverse()
}
