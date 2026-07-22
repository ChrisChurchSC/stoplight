import { scriptedSetupTurn, type SetupAgentContext, type SetupAgentResult } from '../../domain/setupAgent'

/**
 * Asks the server-side /api/setup-agent endpoint (which calls Claude) for the next turn of the
 * first-run intake, and falls back to the scripted questions when the backend is absent, has no key
 * (501), or errors. `live` reports which path answered, so the UI never implies a fixed script read
 * what the person just wrote.
 *
 * Mirrors adapters/ask/generateFlowEdit.ts.
 */
export async function generateSetupTurn(context: SetupAgentContext): Promise<SetupAgentResult & { live: boolean }> {
  try {
    const res = await fetch('/api/setup-agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context }),
    })
    if (!res.ok) throw new Error(`setup-agent ${res.status}`)
    const data = (await res.json()) as SetupAgentResult
    if (typeof data?.reply !== 'string') throw new Error('bad response')
    return { ...data, commands: data.commands ?? [], live: true }
  } catch {
    return { ...scriptedSetupTurn(context), live: false }
  }
}
