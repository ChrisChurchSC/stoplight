import { heuristicRecordsAgent, type RecordAgentContext, type RecordAgentResult } from '../../domain/recordsAgent'
import { apiFetch } from '../../lib/apiFetch'

/**
 * Asks the server-side /api/records-agent endpoint (which calls Claude) and falls back to the
 * deterministic heuristic (advice, no edits) when the backend is absent, has no API key (501),
 * or errors. `live` reports which path answered so the UI can be honest about it. Mirrors
 * adapters/ask/generateFlowEdit.ts.
 */
export async function generateRecordEdit(context: RecordAgentContext): Promise<RecordAgentResult & { live: boolean }> {
  try {
    const res = await apiFetch('/api/records-agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context }),
    })
    if (!res.ok) throw new Error(`records-agent ${res.status}`)
    const data = (await res.json()) as RecordAgentResult
    if (typeof data?.reply !== 'string') throw new Error('bad response')
    return { ...data, commands: data.commands ?? [], live: true }
  } catch {
    return { ...heuristicRecordsAgent(context), live: false }
  }
}
