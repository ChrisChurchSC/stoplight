/**
 * The model account's remaining balance, so the app can say what is left before a generation
 * rather than discovering it as a failure mid-batch.
 *
 * REAL NUMBERS ONLY. There is no app-level credit ledger in Breadcrumbs; what exists is the
 * provider account the keys belong to. So this reports that, in dollars, and reports nothing at all
 * when it cannot be read. A counter that guesses is worse than no counter: it would be trusted
 * exactly as far as a real one and be wrong.
 *
 * OpenRouter only. Anthropic has no equivalent balance endpoint, so an Anthropic-only deployment
 * gets `available: false` and the UI hides the readout rather than inventing one.
 *
 * The key never leaves the server. GET only.
 */
interface ApiReq { method?: string }
interface ApiRes { statusCode: number; setHeader(name: string, value: string): void; end(chunk?: string): void }

export interface AiCredits {
  available: boolean
  /** Dollars still spendable, i.e. purchased minus used. Absent when unavailable. */
  remaining?: number
  totalCredits?: number
  totalUsage?: number
  reason?: string
}

export async function readAiCredits(): Promise<AiCredits> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return { available: false, reason: 'no-openrouter-key' }
  try {
    const r = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!r.ok) return { available: false, reason: `openrouter-${r.status}` }
    const body = (await r.json()) as { data?: { total_credits?: number; total_usage?: number } }
    const totalCredits = Number(body?.data?.total_credits)
    const totalUsage = Number(body?.data?.total_usage)
    if (!Number.isFinite(totalCredits) || !Number.isFinite(totalUsage)) {
      return { available: false, reason: 'unreadable' }
    }
    return {
      available: true,
      totalCredits,
      totalUsage,
      remaining: Math.max(0, totalCredits - totalUsage),
    }
  } catch {
    // Offline, DNS, a blocked egress: all the same answer, which is "cannot say".
    return { available: false, reason: 'unreachable' }
  }
}

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  if (req.method !== 'GET') {
    res.statusCode = 405
    return res.end()
  }
  const out = await readAiCredits()
  res.setHeader('content-type', 'application/json')
  // Short cache: the balance moves with every generation, but this must not become a per-render
  // round trip to OpenRouter either.
  res.setHeader('cache-control', 'private, max-age=30')
  res.end(JSON.stringify(out))
}
