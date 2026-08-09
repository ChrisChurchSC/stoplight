/**
 * The one list of /api routes that ship to production.
 *
 * Both halves of the app read this file: `api/[...path].ts` serves these routes on Vercel, and
 * `vite.config.ts` mounts the same set as dev middleware. That shared read is the point. The two
 * lists used to be maintained by hand in two places, and every time they drifted it shipped a bug:
 * `fill-card` / `scan-site` / `suggest-options` worked on localhost and 404'd on the pilot, and
 * `draft-ctas` had the mirror-image problem (wired in prod, missing in dev). A route added here is
 * now reachable in both environments or neither.
 *
 * Two rules keep this file safe to import from a serverless function:
 *
 *  1. Every entry is a lazy `() => import(...)`. The catch-all is one function, so anything this
 *     module pulls in eagerly would land in that single bundle.
 *  2. Nothing dev-only belongs here. Handlers that drive a real browser (Playwright) or stream SSE
 *     live in `devApiManifest.ts`, which only vite.config.ts imports. Keeping them out is not
 *     cosmetic: `extract-copy` used to reach Playwright through a stray `NoKeyError` import and
 *     dragged the whole browser-automation graph into the deployed bundle with it.
 */

/** A request handler: parsed body in, JSON-serialisable value out. */
export type JsonHandler = (body: unknown) => Promise<unknown>

/** Deferred import of a handler, so listing a route costs nothing until it is called. */
export type HandlerLoader = () => Promise<JsonHandler>

export const API_ROUTES: Record<string, HandlerLoader> = {
  'claude-ask': () => import('./askHandler.js').then((m) => m.runAsk),
  'claude-agent': () => import('./agentHandler.js').then((m) => m.runAgent),
  'flow-agent': () => import('./flowAgentHandler.js').then((m) => m.runFlowAgent),
  'records-agent': () => import('./recordsAgentHandler.js').then((m) => m.runRecordsAgent),
  aggregator: () => import('./aggregatorHandler.js').then((m) => m.runAggregator),
  'coherence-check': () => import('./coherenceHandler.js').then((m) => m.runCoherenceCheck),
  'compose-dataset': () => import('./composeDatasetHandler.js').then((m) => m.runComposeDataset),
  'fill-card': () => import('./fillCardHandler.js').then((m) => m.runFillCard),
  'scan-site': () => import('./scanSiteHandler.js').then((m) => m.runScanSite),
  'suggest-options': () => import('./suggestOptionsHandler.js').then((m) => m.runSuggestOptions),
  'ingest-site': () => import('./ingestSiteHandler.js').then((m) => m.runIngestSite),
  'read-live-post': () => import('./livePostHandler.js').then((m) => m.runReadLivePost),
  'extract-copy': () => import('./extractCopyHandler.js').then((m) => m.runExtractCopy),
  'icp-review': () => import('./icpReviewHandler.js').then((m) => m.runIcpReview),
  'media-mix': () => import('./mediaMixHandler.js').then((m) => m.runMediaMix),

  'draft-copy': () => import('./copyDraftHandler.js').then((m) => m.runCopyDraft),
  'draft-cell': () => import('./draftCellHandler.js').then((m) => m.runDraftCell),
  'draft-angle': () => import('./draftAngleHandler.js').then((m) => m.runDraftAngle),
  'draft-proof': () => import('./draftProofHandler.js').then((m) => m.runDraftProof),
  'draft-ctas': () => import('./draftCtaHandler.js').then((m) => m.runDraftCtas),
  'draft-audiences': () => import('./draftAudienceHandler.js').then((m) => m.runDraftAudiences),
  'draft-messages': () => import('./draftMessageHandler.js').then((m) => m.runDraftMessages),
  'draft-voices': () => import('./draftVoiceHandler.js').then((m) => m.runDraftVoices),
  'draft-objectives': () => import('./draftObjectiveHandler.js').then((m) => m.runDraftObjectives),
  'draft-channels': () => import('./draftChannelHandler.js').then((m) => m.runDraftChannels),
  'draft-brand-profile': () => import('./draftBrandProfileHandler.js').then((m) => m.runDraftBrandProfile),

  // These two narrow their own body type rather than taking `unknown`, so they need the cast the
  // other 25 do not. Widening them would push the same `as` into each handler instead.
  publish: () => import('./publishHandler.js').then((m) => m.runPublish as JsonHandler),
  'publish-email': () => import('./resendHandler.js').then((m) => m.runPublishEmail as JsonHandler),
}

/**
 * Look up a route by name.
 *
 * Goes through `hasOwnProperty` rather than indexing directly: `API_ROUTES` is an object literal,
 * so a plain `API_ROUTES[path]` also answers for everything on `Object.prototype`. That made
 * `/api/toString` resolve to a non-handler and 500 with a raw TypeError, and `/api/__proto__`
 * throw outside the try/catch as an unhandled rejection. Both should simply be 404.
 */
export function lookupRoute(path: string): HandlerLoader | null {
  return Object.prototype.hasOwnProperty.call(API_ROUTES, path) ? API_ROUTES[path] : null
}
