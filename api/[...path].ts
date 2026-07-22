import { jsonRoute } from '../server/apiRoute.js'

/**
 * Single catch-all API router. Vercel's Hobby plan caps a deployment at 12 serverless functions, so
 * instead of one file per endpoint (which put us at 13), every /api/* route is served here: we parse
 * the endpoint from the path and dynamic-import the matching handler in server/. The client calls the
 * exact same /api/<name> paths, and the NO_KEY → 501 contract (via jsonRoute) is preserved so the
 * heuristic fallbacks still work. In local dev these endpoints are served by vite.config.ts middleware
 * instead; this file only runs in the Vercel/serverless deploy.
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

// endpoint name → loader for its POST handler (parsed body in, object out).
const HANDLERS: Record<string, () => Promise<(body: unknown) => Promise<unknown>>> = {
  'flow-agent': () => import('../server/flowAgentHandler.js').then((m) => m.runFlowAgent),
  'setup-agent': () => import('../server/setupAgentHandler.js').then((m) => m.runSetupAgent),
  'records-agent': () => import('../server/recordsAgentHandler.js').then((m) => m.runRecordsAgent),
  'claude-ask': () => import('../server/askHandler.js').then((m) => m.runAsk),
  'claude-agent': () => import('../server/agentHandler.js').then((m) => m.runAgent),
  'coherence-check': () => import('../server/coherenceHandler.js').then((m) => m.runCoherenceCheck),
  'draft-cell': () => import('../server/draftCellHandler.js').then((m) => m.runDraftCell),
  'draft-copy': () => import('../server/copyDraftHandler.js').then((m) => m.runCopyDraft),
  'draft-proof': () => import('../server/draftProofHandler.js').then((m) => m.runDraftProof),
  'draft-ctas': () => import('../server/draftCtaHandler.js').then((m) => m.runDraftCtas),
  'draft-audiences': () => import('../server/draftAudienceHandler.js').then((m) => m.runDraftAudiences),
  'draft-messages': () => import('../server/draftMessageHandler.js').then((m) => m.runDraftMessages),
  'draft-voices': () => import('../server/draftVoiceHandler.js').then((m) => m.runDraftVoices),
  'draft-brand-profile': () => import('../server/draftBrandProfileHandler.js').then((m) => m.runDraftBrandProfile),
  'draft-objectives': () => import('../server/draftObjectiveHandler.js').then((m) => m.runDraftObjectives),
  'draft-channels': () => import('../server/draftChannelHandler.js').then((m) => m.runDraftChannels),
  'draft-angle': () => import('../server/draftAngleHandler.js').then((m) => m.runDraftAngle),
  'ingest-site': () => import('../server/ingestSiteHandler.js').then((m) => m.runIngestSite),
  'extract-copy': () => import('../server/extractCopyHandler.js').then((m) => m.runExtractCopy),
  'icp-review': () => import('../server/icpReviewHandler.js').then((m) => m.runIcpReview),
  'media-mix': () => import('../server/mediaMixHandler.js').then((m) => m.runMediaMix),
  publish: () => import('../server/publishHandler.js').then((m) => m.runPublish as (body: unknown) => Promise<unknown>),
  'publish-email': () => import('../server/resendHandler.js').then((m) => m.runPublishEmail as (body: unknown) => Promise<unknown>),
}

export default async function router(req: ApiReq, res: ApiRes): Promise<void> {
  const path = (req.url ?? '').split('?')[0].replace(/^\/api\//, '').replace(/\/+$/, '')

  // ai-status is a plain GET that reports whether a model key is configured (no handler needed).
  if (path === 'ai-status') {
    if (req.method !== 'GET') {
      res.statusCode = 405
      return res.end()
    }
    const provider = process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : null
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ connected: !!provider, provider }))
  }

  // actuals is a GET ?brand=<name> → BrandActuals JSON (Summer), or 204 when there's no data.
  if (path === 'actuals') {
    if (req.method !== 'GET') {
      res.statusCode = 405
      return res.end()
    }
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

  const loader = HANDLERS[path]
  if (!loader) {
    res.statusCode = 404
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ error: 'not_found', path }))
  }
  const run = await loader()
  // Reuse jsonRoute for method-check, rate-limit, and the NO_KEY/500 error contract.
  return jsonRoute(run)(req as never, res as never)
}
