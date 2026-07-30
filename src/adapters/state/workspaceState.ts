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

/**
 * How long a key waits before its value goes to the server. A single edit (dragging a slider,
 * typing in a field, a save helper that rewrites its whole slice on every keystroke) can call
 * persistState dozens of times a second for the SAME key, and every one of those used to be its own
 * upsert of the entire slice. Only the last value matters, so the burst collapses into one request.
 */
const MIRROR_DELAY_MS = 500

type PendingWrite = {
  /** Newest value handed to persistState. Only this one is ever worth sending. */
  value: unknown
  /** Bumped on every call, so a value that arrives mid-request is noticed and sent after it. */
  seq: number
  /** The `seq` the server has confirmed. */
  sent: number
  timer: ReturnType<typeof setTimeout> | null
  inFlight: boolean
}

const pending = new Map<string, PendingWrite>()

/**
 * Mirror one key, with at most one request in flight for it. When persistState is called while the
 * request is out we loop and send the newer value rather than firing a second overlapping upsert:
 * two in flight have no ordering guarantee, so the older response could land last and quietly
 * resurrect state the user had already replaced.
 */
async function mirror(key: string): Promise<void> {
  const p = pending.get(key)
  if (!p || p.inFlight) return
  const client = supabase
  if (!client) {
    pending.delete(key)
    return
  }
  p.inFlight = true
  try {
    while (p.sent !== p.seq) {
      // We're sending the newest value right now, so any scheduled wake-up for it is redundant.
      if (p.timer) {
        clearTimeout(p.timer)
        p.timer = null
      }
      const ws = await getActiveWorkspaceId()
      if (!ws) return
      // Read the value only once the workspace has resolved: a save that landed in the meantime
      // then rides in this request instead of costing another one.
      const seq = p.seq
      const value = p.value
      try {
        await client
          .from('workspace_state')
          .upsert({ workspace_id: ws, key, value, updated_at: new Date().toISOString() })
      } catch {
        // Network failure. localStorage still holds the value and the next save re-sends it, which
        // is what the old fire-and-forget call did too (it just did it as an unhandled rejection).
        return
      }
      p.sent = seq
    }
  } finally {
    p.inFlight = false
    if (p.sent === p.seq && !p.timer) pending.delete(key)
  }
}

/**
 * Send everything still waiting out its debounce, now. Used on tab hide and after a bulk import,
 * where waiting out the delay would risk the tab going away with the newest value local-only.
 */
export function flushPersistedState(): Promise<void> {
  // Best effort by contract, so it never rejects: a caller awaiting it is asking for the writes to
  // have been attempted, not for them to be guaranteed.
  return Promise.all([...pending.keys()].map((k) => mirror(k).catch(() => undefined))).then(() => undefined)
}

// A tab closed inside the debounce window would strand the newest value in localStorage: this
// device reads it back fine, but another one would hydrate the older server copy. pagehide plus the
// hidden visibility change (the one that actually fires when a mobile tab is backgrounded) send
// what's left. Best effort by nature: the browser may drop the request as the page goes away.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flushPersistedState()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushPersistedState()
  })
}

export function persistState(key: string, value: unknown): void {
  // Synchronous and unconditional: this is the copy a reload reads, so it must never wait on a
  // debounce. Only the workspace mirror below is coalesced.
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / serialization errors, same as before */
  }
  if (!isSupabaseConfigured || !supabase) return
  const p: PendingWrite = pending.get(key) ?? { value, seq: 0, sent: 0, timer: null, inFlight: false }
  p.value = value
  p.seq += 1
  pending.set(key, p)
  // A request already out will pick this value up when it lands, so don't schedule a second wake-up.
  if (p.inFlight) return
  if (p.timer) clearTimeout(p.timer)
  p.timer = setTimeout(() => {
    p.timer = null
    void mirror(key)
  }, MIRROR_DELAY_MS)
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
