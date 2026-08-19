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
 *
 * A mirror that fails is REPORTED (see onSaveTrouble) rather than swallowed. That distinction is
 * the point of the error handling here: localStorage always succeeds, so a workspace write that
 * quietly fails looks identical to one that worked — right up until you open the app in another
 * browser and the campaigns you started aren't there.
 */

/**
 * How long a key waits before its value goes to the server. A single edit (dragging a slider,
 * typing in a field, a save helper that rewrites its whole slice on every keystroke) can call
 * persistState dozens of times a second for the SAME key, and every one of those used to be its own
 * upsert of the entire slice. Only the last value matters, so the burst collapses into one request.
 */
const MIRROR_DELAY_MS = 500

/**
 * A failed mirror retries itself, doubling the wait each time so an unreachable workspace isn't
 * hammered. After RETRY_LIMIT attempts it stops trying on its own but stays pending, so the next
 * edit to that key — or a flush, or the banner's Retry — picks it straight back up.
 */
const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000
const RETRY_LIMIT = 6

type PendingWrite = {
  /** Newest value handed to persistState. Only this one is ever worth sending. */
  value: unknown
  /** Bumped on every call, so a value that arrives mid-request is noticed and sent after it. */
  seq: number
  /** The `seq` the server has confirmed. */
  sent: number
  timer: ReturnType<typeof setTimeout> | null
  inFlight: boolean
  /** Consecutive failed attempts, driving the backoff. Cleared by the first success. */
  failures: number
}

const pending = new Map<string, PendingWrite>()

/**
 * The account copy is behind. Nothing is lost on THIS device — localStorage holds every value — but
 * the work isn't in the workspace, so another browser, another machine, or a teammate won't see it.
 */
export type SaveTrouble = {
  /** Keys whose newest value hasn't reached the workspace. */
  keys: string[]
  /** The most recent reason, straight from the server where there is one. */
  message: string
  /** True when every stuck write failed for want of a workspace (signed out, or no membership). */
  signedOut: boolean
  /**
   * True when a write was REFUSED because the workspace copy moved on under this tab.
   *
   * Categorically different from the failures above and has to be presented differently. Those are
   * "we could not reach the server, we will keep trying"; this one is "the server has something
   * newer and retrying would destroy it". The value is safe in localStorage; what it needs is a
   * reload, not another attempt.
   */
  conflict: boolean
}

const troubled = new Map<string, { message: string; signedOut: boolean; conflict?: boolean }>()

/**
 * The `updated_at` this tab last SAW for each key — from the hydrate that loaded it, or from its
 * own confirmed write. It is the precondition every mirror sends: update this row only if it still
 * looks the way I was last told it looked.
 *
 * Without it the mirror was a plain upsert, so a tab holding an older value would overwrite a newer
 * one whenever it next flushed, and say nothing. That is not hypothetical: on 18 August 2026 a tab
 * that had been open across a database-side merge wrote its stale campaign list back over the
 * merged one, dropping 39 campaigns, and then twenty minutes later replaced a restored task list
 * with its own empty one. Both writes reported success.
 *
 * A key absent from this map has never been seen by this tab, so its write is an insert and a row
 * already being there is itself the conflict.
 */
const seen = new Map<string, string>()
const listeners = new Set<(t: SaveTrouble | null) => void>()

function currentTrouble(): SaveTrouble | null {
  if (troubled.size === 0) return null
  const entries = [...troubled.entries()]
  const [, newest] = entries[entries.length - 1]
  return {
    keys: entries.map(([k]) => k),
    message: newest.message,
    signedOut: entries.every(([, t]) => t.signedOut),
    conflict: entries.some(([, t]) => t.conflict === true),
  }
}

function emit(): void {
  const t = currentTrouble()
  for (const cb of listeners) {
    // A listener is UI; a throwing one must never take the write path down with it.
    try {
      cb(t)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Subscribe to save trouble. Called immediately with the current state, then on every change, and
 * with null once everything pending has landed.
 */
export function onSaveTrouble(cb: (t: SaveTrouble | null) => void): () => void {
  listeners.add(cb)
  cb(currentTrouble())
  return () => {
    listeners.delete(cb)
  }
}

/** The stuck keys right now, or null — a one-off read for a caller that doesn't want a subscription. */
export function saveTrouble(): SaveTrouble | null {
  return currentTrouble()
}

function failed(key: string, p: PendingWrite, message: string, signedOut: boolean): void {
  p.failures += 1
  troubled.set(key, { message, signedOut })
  if (p.failures <= RETRY_LIMIT) {
    const delay = Math.min(RETRY_BASE_MS * 2 ** (p.failures - 1), RETRY_MAX_MS)
    if (p.timer) clearTimeout(p.timer)
    p.timer = setTimeout(() => {
      p.timer = null
      void mirror(key)
    }, delay)
  }
  emit()
}

/**
 * A write the server refused because the row moved on. NOT a failure to reach it, and so not
 * retried: the same conditional write would be refused again, and the only way to "win" would be to
 * drop the precondition, which is the behaviour this exists to end.
 *
 * The pending value stays pending. It is in localStorage, this tab still shows it, and the moment
 * something re-hydrates the key the tab learns the newer stamp and can write again.
 */
function conflicted(key: string, p: PendingWrite): void {
  p.failures = 0
  if (p.timer) {
    clearTimeout(p.timer)
    p.timer = null
  }
  troubled.set(key, {
    message: 'This was changed somewhere else. Reload to see the newer version.',
    signedOut: false,
    conflict: true,
  })
  emit()
}

function landed(key: string): void {
  if (troubled.delete(key)) emit()
}

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
      let ws: string | null = null
      try {
        ws = await getActiveWorkspaceId()
      } catch (e) {
        failed(key, p, String((e as Error)?.message ?? e), true)
        return
      }
      // No workspace means no account to save into: signed out, or signed in without a usable
      // membership. Either way the value stays local, and that is worth saying out loud.
      if (!ws) {
        failed(key, p, 'Not signed in to a workspace', true)
        return
      }
      // Read the value only once the workspace has resolved: a save that landed in the meantime
      // then rides in this request instead of costing another one.
      const seq = p.seq
      const value = p.value
      let message: string | null = null
      /**
       * CONDITIONAL, not an upsert. The row is written only if its updated_at still matches what
       * this tab last saw, so a tab holding an older value is refused instead of winning.
       *
       * Never seen it? Then this is an insert, and a row already existing IS the conflict: some
       * other writer created it while this tab believed the key was empty.
       */
      const stamp = new Date().toISOString()
      const prev = seen.get(key)
      let conflict = false
      try {
        // The error is READ, not discarded. postgrest-js resolves with { error } instead of
        // rejecting unless shouldThrowOnError is set (it isn't anywhere here), so `await …(…)` on
        // its own swallows an RLS denial, an expired JWT and an oversized payload alike — and the
        // line below would then mark the write confirmed. supabaseSheetAdapter.writeBatch learned
        // the same lesson; this path hadn't.
        if (prev) {
          const { data, error } = await client
            .from('workspace_state')
            .update({ value, updated_at: stamp })
            .eq('workspace_id', ws)
            .eq('key', key)
            .eq('updated_at', prev)
            .select('updated_at')
          message = error?.message ?? null
          // No error and no row matched means the precondition failed: the row is still there, it
          // just does not look the way this tab was told it looked.
          if (!message && (data?.length ?? 0) === 0) conflict = true
          else if (!message) seen.set(key, stamp)
        } else {
          const { data, error } = await client
            .from('workspace_state')
            .insert({ workspace_id: ws, key, value, updated_at: stamp })
            .select('updated_at')
          if (error?.code === '23505') conflict = true
          else {
            message = error?.message ?? null
            if (!message && (data?.length ?? 0) > 0) seen.set(key, stamp)
          }
        }
      } catch (e) {
        // Network failure. localStorage still holds the value, and the retry below re-sends it.
        message = String((e as Error)?.message ?? e)
      }
      if (conflict) {
        conflicted(key, p)
        return
      }
      if (message) {
        failed(key, p, message, false)
        return
      }
      p.sent = seq
      p.failures = 0
      landed(key)
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

/**
 * Try every stuck key again now, ignoring the backoff — what the save banner's Retry calls once the
 * person has, say, signed back in.
 */
export function retryPersistedState(): Promise<void> {
  for (const p of pending.values()) {
    p.failures = 0
    if (p.timer) {
      clearTimeout(p.timer)
      p.timer = null
    }
  }
  return flushPersistedState()
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

/**
 * Returns whether the LOCAL write landed. Most callers ignore it — a failed mirror is recoverable
 * and a failed local write usually just means the next one will re-send. Callers that show the user
 * something on the strength of the save (saveOutputTypes rolls its table back and names the quota)
 * need to be able to tell, and a quota error swallowed in here is invisible to them.
 *
 * The server mirror is deliberately NOT part of this answer: it's debounced, so it hasn't happened
 * yet when this returns. Its outcome arrives later, through onSaveTrouble.
 */
export function persistState(key: string, value: unknown): boolean {
  // Synchronous and unconditional: this is the copy a reload reads, so it must never wait on a
  // debounce. Only the workspace mirror below is coalesced.
  let stored = true
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota or serialization. Still mirror to the workspace below — the server has no quota, and a
    // value that cannot fit in this browser is exactly the one worth getting off it.
    stored = false
  }
  if (!isSupabaseConfigured || !supabase) return stored
  const p: PendingWrite = pending.get(key) ?? { value, seq: 0, sent: 0, timer: null, inFlight: false, failures: 0 }
  p.value = value
  p.seq += 1
  // A fresh edit deserves a fresh attempt: clear the backoff so a key that had given up isn't
  // stranded waiting for a flush.
  p.failures = 0
  pending.set(key, p)
  // A request already out will pick this value up when it lands, so don't schedule a second wake-up.
  if (p.inFlight) return stored
  if (p.timer) clearTimeout(p.timer)
  p.timer = setTimeout(() => {
    p.timer = null
    void mirror(key)
  }, MIRROR_DELAY_MS)
  return stored
}

/**
 * Every persisted state key for the signed-in workspace, as { key: value }, plus whether the read
 * actually happened.
 *
 * `ok` matters as much as the data: a failed read used to return {}, which the caller could only
 * read as "this workspace has nothing saved" — so a permissions or network problem presented as an
 * empty account, and hydration carried on as though the workspace were simply new.
 */
export async function hydrateState(): Promise<{ state: Record<string, unknown>; ok: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { state: {}, ok: true }
  const ws = await getActiveWorkspaceId()
  if (!ws) return { state: {}, ok: false, error: 'Not signed in to a workspace' }
  const { data, error } = await supabase
    .from('workspace_state')
    .select('key, value, updated_at')
    .eq('workspace_id', ws)
  if (error) return { state: {}, ok: false, error: error.message }
  const out: Record<string, unknown> = {}
  for (const r of data ?? []) {
    const row = r as { key: string; value: unknown; updated_at?: string }
    out[row.key] = row.value
    // The stamp every later write is measured against. Hydrating is also how a tab recovers from a
    // conflict: it learns the newer stamp here and its next write is accepted.
    if (row.updated_at) seen.set(row.key, row.updated_at)
    else seen.delete(row.key)
  }
  return { state: out, ok: true }
}
