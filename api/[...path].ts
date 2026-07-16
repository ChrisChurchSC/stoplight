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
  'records-agent': () => import('../server/recordsAgentHandler.js').then((m) => m.runRecordsAgent),
  'claude-ask': () => import('../server/askHandler.js').then((m) => m.runAsk),
  'claude-agent': () => import('../server/agentHandler.js').then((m) => m.runAgent),
  'coherence-check': () => import('../server/coherenceHandler.js').then((m) => m.runCoherenceCheck),
  'draft-cell': () => import('../server/draftCellHandler.js').then((m) => m.runDraftCell),
  'draft-copy': () => import('../server/copyDraftHandler.js').then((m) => m.runCopyDraft),
  'draft-proof': () => import('../server/draftProofHandler.js').then((m) => m.runDraftProof),
  'draft-audiences': () => import('../server/draftAudienceHandler.js').then((m) => m.runDraftAudiences),
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
