import { jsonRoute } from '../server/apiRoute.js'
import { requireAuth } from '../server/apiAuth.js'
import { lookupRoute } from '../server/apiManifest.js'

/**
 * Single catch-all API router. Vercel's Hobby plan caps a deployment at 12 serverless functions, so
 * instead of one file per endpoint (which put us at 13), every /api/* route is served here: we parse
 * the endpoint from the path and dynamic-import the matching handler in server/. The client calls the
 * exact same /api/<name> paths, and the NO_KEY -> 501 contract (via jsonRoute) is preserved so the
 * heuristic fallbacks still work.
 *
 * The route table itself lives in server/apiManifest.ts, which vite.config.ts also mounts as dev
 * middleware. It used to be duplicated here by hand, and the copies drifted: "describe this card and
 * fill it in", "fill this in from the site" and the per-field suggestions all shipped with a dev
 * middleware and no entry here, so they worked on localhost and 404'd on the pilot. One list means
 * that class of bug needs a deliberate edit rather than a forgotten one.
 *
 * Routes below that are NOT in the manifest are the ones with no dev equivalent: plain GETs, the
 * OAuth bounce, and the paste-a-key connect flow.
 */

interface ApiReq {
  method?: string
  url?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}
interface ApiRes {
  statusCode: number
  setHeader(name: string, value: string): void
  end(chunk?: string): void
}


export default async function router(req: ApiReq, res: ApiRes): Promise<void> {
  const path = (req.url ?? '').split('?')[0].replace(/^\/api\//, '').replace(/\/+$/, '')

  // ai-status is a plain GET that reports whether a model key is configured (no handler needed).
  if (path === 'ai-status') {
    if (req.method !== 'GET') {
      res.statusCode = 405
      return res.end()
    }
    if (!(await requireAuth(req, res))) return
    const provider = process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : null
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ connected: !!provider, provider }))
  }

  /**
   * ai-credits is the model account's remaining balance, and it belongs here rather than in its own
   * file. api/ai-credits.ts was the single endpoint missing from .vercelignore, so it shipped as its
   * own function, never reached jsonRoute, and answered anonymously: a plain GET against the live
   * pilot returned the account's usage and what was left of it. Routing it through the catch-all is
   * what puts requireAuth in front of it.
   */
  if (path === 'ai-credits') {
    if (req.method !== 'GET') {
      res.statusCode = 405
      return res.end()
    }
    if (!(await requireAuth(req, res))) return
    const { readAiCredits } = await import('../server/aiCredits.js')
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'private, max-age=30')
    return res.end(JSON.stringify(await readAiCredits()))
  }

  // actuals is a GET ?brand=<name> → BrandActuals JSON (Summer), or 204 when there's no data.
  if (path === 'actuals') {
    if (req.method !== 'GET') {
      res.statusCode = 405
      return res.end()
    }
    if (!(await requireAuth(req, res))) return
    const qs = new URLSearchParams((req.url ?? '').split('?')[1] ?? '')
    const brand = qs.get('brand') ?? ''
    const workspaceId = qs.get('workspace') ?? undefined
    const website = qs.get('website') ?? undefined
    try {
      const { runActuals } = await import('../server/actualsHandler.js')
      const data = await runActuals(brand, { workspaceId, website })
      if (!data) {
        res.statusCode = 204
        return res.end()
      }
      res.setHeader('content-type', 'application/json')
      return res.end(JSON.stringify(data))
    } catch {
      res.statusCode = 204
      return res.end()
    }
  }

  // In-app connect flow (single-segment paths — Vercel only routes those to this catch-all):
  // /api/google-connect?workspace=<id> begins OAuth; /api/google-callback stores the workspace's
  // refresh token + discovered sources, then redirects back to the app.
  //
  // These two are deliberately NOT behind requireAuth, and cannot be: google-connect is a top-level
  // browser navigation and google-callback is Google calling us, so neither request can carry an
  // Authorization header. Anyone who knows a workspace id can therefore start (and complete) an
  // OAuth grant against it. Locking them down needs a signed state/nonce minted by an authenticated
  // request, not a bearer token.
  if (path === 'google-connect') {
    const workspace = new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('workspace') ?? ''
    const { googleAuthUrl, googleConfigured } = await import('../server/googleConnect.js')
    if (!googleConfigured() || !workspace) {
      res.statusCode = 400
      return res.end('google connect not configured or missing workspace')
    }
    res.statusCode = 302
    res.setHeader('location', googleAuthUrl(workspace))
    return res.end()
  }
  if (path === 'google-callback') {
    const qs = new URLSearchParams((req.url ?? '').split('?')[1] ?? '')
    const code = qs.get('code') ?? ''
    const state = qs.get('state') ?? ''
    let ok = false
    try {
      const { googleCallback } = await import('../server/googleConnect.js')
      ok = !!(code && state) && (await googleCallback(code, state))
    } catch {
      ok = false
    }
    res.statusCode = 302
    res.setHeader('location', `https://stoplight-ochre.vercel.app/?connected=${ok ? 'google' : 'error'}`)
    return res.end()
  }
  // Resend connect: paste-key flow. POST { workspace, key } → stored against the workspace.
  if (path === 'connect-resend') {
    if (req.method !== 'POST') {
      res.statusCode = 405
      return res.end()
    }
    if (!(await requireAuth(req, res))) return
    const raw =
      typeof req.body === 'string'
        ? (() => {
            try {
              return JSON.parse(req.body as string)
            } catch {
              return {}
            }
          })()
        : req.body ?? {}
    const b = raw as { workspace?: string; key?: string }
    res.setHeader('content-type', 'application/json')
    if (!b.workspace || !b.key) {
      res.statusCode = 400
      return res.end(JSON.stringify({ ok: false, error: 'Missing workspace or key.' }))
    }
    try {
      // Verify the key against Resend BEFORE storing it, so a bad key never shows as "Connected".
      const { verifyResendKey } = await import('../server/resendActuals.js')
      const check = await verifyResendKey(b.key)
      if (!check.ok) {
        res.statusCode = 400
        return res.end(JSON.stringify({ ok: false, error: check.error }))
      }
      const { saveConnection } = await import('../server/connections.js')
      const saved = await saveConnection(b.workspace, 'resend', { api_key: b.key }, {})
      res.statusCode = saved ? 200 : 500
      return res.end(JSON.stringify(saved ? { ok: true } : { ok: false, error: 'Verified, but could not save the connection.' }))
    } catch {
      res.statusCode = 500
      return res.end(JSON.stringify({ ok: false, error: 'Something went wrong verifying the key.' }))
    }
  }

  const loader = lookupRoute(path)
  if (!loader) {
    res.statusCode = 404
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ error: 'not_found', path }))
  }
  const run = await loader()
  // Reuse jsonRoute for method-check, rate-limit, and the NO_KEY/500 error contract.
  return jsonRoute(run)(req as never, res as never)
}
