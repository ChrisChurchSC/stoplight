/**
 * Calls the server-side Claude engine (/api/claude-agent), which runs Claude with
 * the connector tools and returns the actions it took (reads + publishes) plus a
 * summary. `live: false` means the engine was unavailable (no key / error); the
 * caller then runs the same work directly through the adapters. Same seam pattern
 * as the other Claude endpoints.
 */

export interface AgentAction {
  tool: string
  input: Record<string, unknown>
  output: unknown
}

export async function claudeAgent(
  instruction: string,
  context: unknown,
): Promise<{ summary: string; actions: AgentAction[]; live: boolean }> {
  try {
    const res = await fetch('/api/claude-agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instruction, context }),
    })
    if (!res.ok) throw new Error(`agent ${res.status}`)
    const data = (await res.json()) as { summary?: string; actions?: AgentAction[] }
    if (!Array.isArray(data?.actions)) throw new Error('bad shape')
    return { summary: data.summary ?? '', actions: data.actions, live: true }
  } catch {
    return { summary: '', actions: [], live: false }
  }
}
