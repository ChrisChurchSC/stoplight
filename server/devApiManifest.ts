/**
 * Routes that exist only on the dev server, and why each one cannot be deployed.
 *
 * This file is imported by `vite.config.ts` and by nothing else. `api/[...path].ts` must never
 * import it: every handler below reaches `playwright` (a devDependency whose browser binaries are
 * not in a function bundle), so pulling this module into the catch-all would bloat the one deployed
 * function and break the build outright if it ever ran with `--omit=dev`.
 *
 * The split is deliberate rather than accidental — DEPLOY.md documents these as local-only and the
 * UI degrades gracefully when they 404 in production. Keeping them in a separate module is what
 * makes "not deployed" a property of the code instead of a fact someone has to remember.
 *
 * If one of these is ever wired for serverless, it moves to `apiManifest.ts`. The streaming ones
 * additionally need a response path that can flush (`jsonRoute` buffers a single JSON body), and
 * `map-site` / `ingest-channel` need a serverless Chromium before they could work at all.
 */

/** Progress events are shaped per handler; the dev server just forwards them as SSE `data`. */
export type StreamProgress = (event: unknown) => void

export type StreamHandler = (body: unknown, onProgress?: StreamProgress) => Promise<unknown>

export type JsonHandler = (body: unknown) => Promise<unknown>

/**
 * Dev-only, plain JSON. Both crawl the client's site with a headed browser.
 *
 * `setup` has a live caller (`src/adapters/setup/setupGenerator.ts`) that catches the failure and
 * falls back to a name derived from the domain — so in production "Claude sets up the workspace"
 * quietly returns the heuristic result rather than erroring.
 */
export const DEV_JSON_ROUTES: Record<string, () => Promise<JsonHandler>> = {
  setup: () => import('./setupHandler.js').then((m) => m.runSetup),
  'map-site': () => import('./siteMapHandler.js').then((m) => m.runSiteMap),
}

/**
 * Dev-only, Server-Sent Events. Each emits `progress` frames then a single `result` or `error`.
 *
 * The four CRM ingests are pure HTTP and could be deployed once there is a streaming route; the two
 * site/channel readers drive a real browser and could not.
 */
export const DEV_STREAM_ROUTES: Record<string, () => Promise<StreamHandler>> = {
  'map-site-stream': () => import('./siteMapHandler.js').then((m) => m.runSiteMap),
  'ingest-channel': () => import('./ingestChannelHandler.js').then((m) => m.runIngestChannel),
  'ingest-sanity': () => import('./sanityIngestHandler.js').then((m) => m.runSanityIngest),
  'ingest-resend': () => import('./resendIngestHandler.js').then((m) => m.runResendIngest),
  'ingest-google-ads': () => import('./googleAdsIngestHandler.js').then((m) => m.runGoogleAdsIngest),
  'ingest-neon': () => import('./neonIngestHandler.js').then((m) => m.runNeonIngest),
}
