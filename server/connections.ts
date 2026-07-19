/**
 * Server-side connector store. Reads/writes `workspace_connections` through the Supabase REST API
 * with the SERVICE ROLE key, so per-workspace credentials (refresh tokens / api keys) live only on
 * the server and never reach a browser. No-op (returns false/null) until SUPABASE_SERVICE_ROLE_KEY
 * is set, so the app keeps working on the single-tenant env-var path until then.
 */
const SUPA_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export function connectionsReady(): boolean {
  return !!(SUPA_URL && SERVICE_KEY)
}

const headers = (): Record<string, string> => ({
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
})

/** Upsert a workspace's connection (provider credentials + non-secret config). */
export async function saveConnection(
  workspaceId: string,
  provider: string,
  credentials: unknown,
  config: unknown,
): Promise<boolean> {
  if (!connectionsReady()) return false
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/workspace_connections`, {
      method: 'POST',
      headers: { ...headers(), prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        provider,
        credentials,
        config: config ?? {},
        status: 'connected',
        updated_at: new Date().toISOString(),
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Read a workspace's connection (credentials + config). Server-only. Null when absent/unconfigured. */
export async function getConnection(
  workspaceId: string,
  provider: string,
): Promise<{ credentials: Record<string, unknown>; config: Record<string, unknown> } | null> {
  if (!connectionsReady()) return null
  try {
    const q = `workspace_id=eq.${encodeURIComponent(workspaceId)}&provider=eq.${encodeURIComponent(provider)}&select=credentials,config`
    const res = await fetch(`${SUPA_URL}/rest/v1/workspace_connections?${q}`, { headers: headers() })
    if (!res.ok) return null
    const rows = (await res.json()) as { credentials?: Record<string, unknown>; config?: Record<string, unknown> }[]
    const row = Array.isArray(rows) ? rows[0] : null
    return row ? { credentials: row.credentials ?? {}, config: row.config ?? {} } : null
  } catch {
    return null
  }
}
