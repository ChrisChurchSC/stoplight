import { getActiveWorkspaceId } from '../../lib/session'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

/**
 * Workspace-scoped key→value state (the brand system, client list, campaign metadata, reports, …).
 * These aren't record lists but keyed maps / single objects, so each persists as one jsonb row in
 * `workspace_state`, under the same localStorage key the app already uses.
 *
 * persistState() writes localStorage always (cache/offline) and mirrors to the workspace when a
 * backend is configured; hydrateState() pulls the whole set back on sign-in. Additive: with no
 * backend it's a plain localStorage write, unchanged from before.
 */
export function persistState(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / serialization errors, same as before */
  }
  if (!isSupabaseConfigured || !supabase) return
  const client = supabase
  void (async () => {
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    await client.from('workspace_state').upsert({ workspace_id: ws, key, value, updated_at: new Date().toISOString() })
  })()
}

/** Every persisted state key for the signed-in workspace, as { key: value }. Empty on localStorage. */
export async function hydrateState(): Promise<Record<string, unknown>> {
  if (!isSupabaseConfigured || !supabase) return {}
  const ws = await getActiveWorkspaceId()
  if (!ws) return {}
  const { data } = await supabase.from('workspace_state').select('key, value').eq('workspace_id', ws)
  const out: Record<string, unknown> = {}
  for (const r of data ?? []) out[(r as { key: string }).key] = (r as { value: unknown }).value
  return out
}
