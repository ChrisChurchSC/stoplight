import { heuristicFlowAgent, type FlowAgentContext, type FlowAgentResult } from '../../domain/flowAgent'

/**
 * Asks the server-side /api/flow-agent endpoint (which calls Claude) and falls back to the
 * deterministic heuristic (advice, no edits) when the backend is absent, has no API key
 * (501), or errors. `live` reports which path answered so the UI can be honest about it.
 */
export async function generateFlowEdit(context: FlowAgentContext): Promise<FlowAgentResult & { live: boolean }> {
  try {
    const res = await fetch('/api/flow-agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context }),
    })
    if (!res.ok) throw new Error(`flow-agent ${res.status}`)
    const data = (await res.json()) as FlowAgentResult
    if (typeof data?.reply !== 'string') throw new Error('bad response')
    return { ...data, commands: data.commands ?? [], live: true }
  } catch {
    return { ...heuristicFlowAgent(context), live: false }
  }
}
