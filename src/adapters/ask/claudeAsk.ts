import { heuristicAnswer, type AskAnswer, type AskContext } from '../../domain/askClaude'

/**
 * Asks the server-side /api/claude-ask endpoint (which calls Claude) and falls
 * back to the local heuristic answerer when the backend is absent, has no API key
 * (501), or errors. Either way the answer is grounded in the same precomputed
 * findings, so it's never wrong, only more or less fluent. `live` reports which
 * path answered so the UI can be honest about it.
 */
export async function askClaude(context: AskContext): Promise<AskAnswer & { live: boolean }> {
  try {
    const res = await fetch('/api/claude-ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context }),
    })
    if (!res.ok) throw new Error(`claude-ask ${res.status}`)
    const data = (await res.json()) as AskAnswer
    if (!data?.answer) throw new Error('empty answer')
    return { ...data, live: true }
  } catch {
    return { ...heuristicAnswer(context), live: false }
  }
}
