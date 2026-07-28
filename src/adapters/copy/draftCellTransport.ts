import type { ChannelId } from '../../domain/types'

/** What the Claude per-cell writer needs to compose one personalized asset. */
export interface DraftCellRequest {
  client: string
  audience: { name: string; role?: string; angle?: string; outcome?: string }
  stage: { key: string; label: string; intent: string }
  channel: { id: ChannelId; label: string; format: string }
  components: { key: string; label: string; recommended?: number; hardLimit?: number; multiline?: boolean }[]
  proof: { label: string; detail: string } | null
  cta: string
  voice?: string
}

/**
 * Generate per-component copy for one matrix cell via Claude (server-side
 * /api/draft-cell). Returns a key→value map, or null when the backend is absent /
 * has no key (501) / errors — so the caller falls back to the deterministic
 * composer and drafting always works, key or not.
 */
export async function draftCellCopy(req: DraftCellRequest): Promise<Record<string, string> | null> {
  try {
    const res = await fetch('/api/draft-cell', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!res.ok) return null
    const out = (await res.json()) as { components?: { key: string; value: string }[] }
    if (!out?.components?.length) return null
    const map: Record<string, string> = {}
    for (const c of out.components) if (c.key && typeof c.value === 'string' && c.value.trim()) map[c.key] = c.value
    return Object.keys(map).length ? map : null
  } catch {
    return null
  }
}
