import { isSupabaseConfigured, supabase } from './supabase'
import { getActiveWorkspaceId } from './session'
import { runAgentAction } from './agentBridge'

/**
 * THE DEPLOYED APP'S HALF OF THE CLAUDE DESKTOP CONNECTOR.
 *
 * The connector reached the app through a Vite plugin: an SSE hub holding open streams to tabs,
 * with the in-flight commands in module scope. Stateful by construction, so it only ever existed
 * while `npm run dev` was running — driving the deployed app from Desktop was not a configuration
 * away, it was impossible.
 *
 * The queue moved into the workspace database, which both ends can already reach. This is the end
 * that does the work: it watches for commands addressed to the signed-in workspace, runs them
 * against this tab's store, and writes the answer back.
 *
 * THE TAB IS STILL THE EXECUTOR, and that is deliberate rather than a limitation worked around. The
 * app's behaviour lives in its store — sixty-odd actions, each with its own rules about what may
 * follow what. Running them anywhere else would mean a second implementation of the same rules,
 * drifting apart from this one from the day it was written.
 *
 * CLAIMED, NOT JUST READ. Two tabs open on the same workspace both see the same pending row, so the
 * claim is a conditional update — `where claimed_at is null` — and only the tab whose update
 * returns the row runs it. Without that, "add a client" from Desktop with two tabs open adds two.
 */

/** How often to look for work. Fast enough to feel like a conversation, slow enough to be free. */
const IDLE_MS = 2_000
/** A command that has been claimed this long without an answer is from a tab that went away. */
const STALE_CLAIM_MS = 90_000

interface QueuedCommand {
  id: string
  action: string
  args: Record<string, unknown> | null
  claimed_at: string | null
}

let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let stopped = true

/** Take a pending command, or return null if another tab took it first. */
async function claim(row: QueuedCommand): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase
    .from('agent_commands')
    .update({ claimed_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('claimed_at', null)
    .select('id')
  // The error is READ rather than discarded: postgrest resolves with { error } instead of
  // rejecting, so an RLS denial here would otherwise look exactly like "another tab won".
  if (error) return false
  return (data?.length ?? 0) > 0
}

async function answer(id: string, out: { result?: unknown; error?: string }): Promise<void> {
  if (!supabase) return
  await supabase
    .from('agent_commands')
    .update({
      status: out.error ? 'error' : 'done',
      // `result ?? null` rather than `result`: an action that legitimately returns undefined must
      // still land as an answer, or the caller waits out its whole timeout on a command that ran.
      result: out.error ? null : ((out.result ?? null) as never),
      error: out.error ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
}

/** One pass: take the oldest unclaimed command for this workspace and run it. */
async function tick(): Promise<void> {
  if (!supabase) return
  const ws = await getActiveWorkspaceId()
  if (!ws) return
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString()
  const { data, error } = await supabase
    .from('agent_commands')
    .select('id, action, args, claimed_at')
    .eq('workspace_id', ws)
    .eq('status', 'pending')
    // Unclaimed, or claimed so long ago that the tab holding it is gone. Without the second case a
    // tab closed mid-command would strand it pending until it aged out, and every later command
    // would queue behind a row nobody is ever going to answer.
    .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error || !data?.length) return

  const row = data[0] as QueuedCommand
  // A stale claim is re-taken by clearing it first, so the same conditional update decides the
  // winner when several tabs notice the same abandoned row at once.
  if (row.claimed_at) await supabase.from('agent_commands').update({ claimed_at: null }).eq('id', row.id)
  if (!(await claim(row))) return

  await answer(row.id, await runAgentAction(row.action, row.args ?? {}))
}

async function loop(): Promise<void> {
  if (stopped || running) return
  running = true
  try {
    await tick()
  } catch {
    // Never let one bad pass end the loop: a network blip would otherwise disconnect the tab from
    // Desktop silently, and the only symptom is commands that never come back.
  } finally {
    running = false
    if (!stopped) timer = setTimeout(() => void loop(), IDLE_MS)
  }
}

/**
 * Start watching for commands. Idempotent, and a no-op with no Supabase configured — a local tab
 * with no workspace has nothing to be addressed.
 */
export function startAgentQueue(): void {
  if (!isSupabaseConfigured || !supabase || !stopped) return
  stopped = false
  void loop()
}

export function stopAgentQueue(): void {
  stopped = true
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

// Dev only: swap the loop cleanly when this module is edited, so an old poller is never left
// running beside the new one (two pollers means two claims racing for every command).
if (import.meta.hot) {
  import.meta.hot.dispose(() => stopAgentQueue())
  import.meta.hot.accept((mod) => {
    ;(mod as { startAgentQueue?: () => void } | undefined)?.startAgentQueue?.()
  })
}
