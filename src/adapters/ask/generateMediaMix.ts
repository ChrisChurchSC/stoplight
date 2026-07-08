import { heuristicMixPlan, type MixGenContext, type MixGenPlan } from '../../domain/mediaMixGen'

/**
 * Asks the server-side /api/media-mix endpoint (which calls Claude) and falls
 * back to the deterministic heuristic plan when the backend is absent, has no API
 * key (501), or errors. Both paths are grounded in the same Summer-backed baseline,
 * so the plan is never wrong, only more or less fluent. `live` reports which path
 * answered so the UI can be honest about it.
 */
export async function generateMediaMix(context: MixGenContext): Promise<MixGenPlan & { live: boolean }> {
  try {
    const res = await fetch('/api/media-mix', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context }),
    })
    if (!res.ok) throw new Error(`media-mix ${res.status}`)
    const data = (await res.json()) as MixGenPlan
    if (!data?.channels?.length) throw new Error('empty plan')
    return { ...data, live: true }
  } catch {
    return { ...heuristicMixPlan(context), live: false }
  }
}
