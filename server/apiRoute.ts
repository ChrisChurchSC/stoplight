/**
 * Adapts a server handler (the same ones the Vite dev middleware uses) into a Vercel serverless
 * function for production. In dev, vite.config.ts serves /api via middleware; in prod, the files in
 * /api/*.ts call jsonRoute() with the matching handler. The client hits the same /api/... path
 * either way, and the NO_KEY→501 contract is preserved so its heuristic fallbacks still work.
 *
 * Keys stay server-side (Vercel env vars). Access is gated by Vercel Deployment Protection (see
 * DEPLOY.md); this adds a best-effort per-instance rate guard to blunt a runaway client loop. A
 * real cross-instance rate limit needs Vercel KV — a documented follow-up.
 *
 * Every POST handler is reached through jsonRoute, so the signed-in check lives here once rather
 * than in 35 handlers.
 */
import { requireAuth } from './apiAuth.js'

// Minimal Node/Vercel function shapes (avoid pulling in @vercel/node for two interfaces).
interface ApiReq {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}
interface ApiRes {
  statusCode: number
  setHeader(name: string, value: string): void
  end(chunk?: string): void
}

// Best-effort limiter: caps requests per warm instance so an accidental client loop can't fan out
// hundreds of Claude calls a second. Not a substitute for an Anthropic spend cap (see DEPLOY.md).
const HITS: number[] = []
const RATE_LIMIT = 40
const RATE_WINDOW_MS = 60_000
function withinRate(): boolean {
  const now = Date.now()
  while (HITS.length && HITS[0] < now - RATE_WINDOW_MS) HITS.shift()
  if (HITS.length >= RATE_LIMIT) return false
  HITS.push(now)
  return true
}

// The dev middleware handed each handler `JSON.parse(body)` (i.e. `any`), and handlers narrow it
// themselves — so keep the wrapper's body `any` to match every handler's own param type.
function readBody(req: ApiReq): unknown {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body)
    } catch {
      /* fall through */
    }
  }
  return {}
}

/** Wrap a JSON handler (parsed body in, object out) as a Vercel serverless function. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function jsonRoute(run: (body: any) => Promise<unknown>, method: 'POST' | 'GET' = 'POST') {
  return async (req: ApiReq, res: ApiRes): Promise<void> => {
    if (req.method !== method) {
      res.statusCode = 405
      return res.end()
    }
    // Before the rate guard: an unauthenticated caller must not be able to spend the window.
    if (!(await requireAuth(req, res))) return
    if (!withinRate()) {
      res.statusCode = 429
      res.setHeader('content-type', 'application/json')
      return res.end(JSON.stringify({ error: 'rate_limited' }))
    }
    try {
      const result = await run(readBody(req))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (err) {
      // NO_BUDGET shares NO_KEY's 501 on purpose. Every client adapter reads 501 as "the model is
      // not available, use the heuristic writer"; an exhausted budget is that same state, and a 500
      // would surface it as a crash and skip the fallbacks.
      const code = (err as { code?: string })?.code
      res.statusCode = code === 'NO_KEY' || code === 'NO_BUDGET' ? 501 : 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
    }
  }
}
