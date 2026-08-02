import { defineConfig, loadEnv, type PluginOption } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { agentBridgeApi } from './server/agentBridge'
import { mainCheckoutRoot } from './server/worktreeEnv'
import { API_ROUTES } from './server/apiManifest'
import { DEV_JSON_ROUTES, DEV_STREAM_ROUTES } from './server/devApiManifest'

/**
 * The dev server's /api layer.
 *
 * This used to be 37 near-identical `PluginOption` functions — ~1,250 lines that differed only in
 * the route path and which handler they imported. The cost of that shape was not the line count: it
 * was that the list of dev routes and the list of production routes were maintained separately, so
 * they drifted, and every drift shipped as a bug (`fill-card`/`scan-site`/`suggest-options` worked
 * locally and 404'd on the pilot; `draft-ctas` was wired in production but missing here).
 *
 * Both environments now read the same manifests, and `server/__tests__/apiManifest.test.ts` fails
 * the build if they stop agreeing.
 */

/** Collect a request body. Handlers parse it themselves, so this stays a string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
  })
}

/**
 * Mirrors production's `jsonRoute` (server/apiRoute.ts): POST-only, JSON out, and NO_KEY → 501 so
 * the client adapters take their heuristic fallback instead of surfacing an error.
 *
 * Production additionally applies `requireAuth` and a rate guard. Dev deliberately has neither —
 * there is no session to check against a local server, and the guard exists to blunt a runaway
 * client loop against a metered account.
 */
function jsonMiddleware(load: () => Promise<(body: unknown) => Promise<unknown>>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      return res.end()
    }
    const body = await readBody(req)
    try {
      const run = await load()
      const result = await run(JSON.parse(body || '{}'))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (err) {
      const code = (err as { code?: string })?.code
      res.statusCode = code === 'NO_KEY' ? 501 : 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
    }
  }
}

/**
 * Server-Sent Events: `progress` frames while the handler works, then exactly one `result` or
 * `error`. The client adapters in src/adapters/setup/ split on a blank line and read `event:` /
 * `data:`, so the frame format here is a contract — see server/__tests__/apiManifest.test.ts.
 *
 * The 200 head is written before the handler runs, so an error mid-stream arrives as an `error`
 * frame rather than a status code. That is why the clients read the failure out of the frame.
 */
function streamMiddleware(load: () => Promise<(body: unknown, onProgress?: (e: unknown) => void) => Promise<unknown>>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      return res.end()
    }
    const body = await readBody(req)
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    try {
      const run = await load()
      const result = await run(JSON.parse(body || '{}'), (e) => send('progress', e))
      send('result', result)
    } catch (err) {
      const code = (err as { code?: string })?.code
      send('error', { code: code ?? null, message: String((err as Error)?.message ?? err) })
    } finally {
      res.end()
    }
  }
}

/**
 * Every /api route the dev server answers, mounted from the manifests.
 *
 * `connect/*` is not in a manifest: it is the only pair that shares in-process state (a `pending`
 * Map keyed by token, so start and save must hit the same process) and it opens a headed browser
 * for the operator to log in. It is local-only by construction, not by configuration.
 */
function devApi(): PluginOption {
  return {
    name: 'dev-api',
    configureServer(server) {
      for (const [name, load] of Object.entries({ ...API_ROUTES, ...DEV_JSON_ROUTES })) {
        server.middlewares.use(`/api/${name}`, jsonMiddleware(load))
      }
      for (const [name, load] of Object.entries(DEV_STREAM_ROUTES)) {
        server.middlewares.use(`/api/${name}`, streamMiddleware(load))
      }

      // Whether a model key is configured. Cheap, synchronous, and read on app boot.
      server.middlewares.use('/api/ai-status', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          return res.end()
        }
        const provider = process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : null
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ connected: !!provider, provider }))
      })

      // The model account's remaining balance. Imports from server/, never from api/ — an api/
      // import compiles locally and fails the deploy, because .vercelignore deletes those files
      // before the build.
      server.middlewares.use('/api/ai-credits', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          return res.end()
        }
        void import('./server/aiCredits')
          .then((m) => m.readAiCredits())
          .then((out) => {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(out))
          })
          .catch(() => {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ available: false, reason: 'unreachable' }))
          })
      })

      // Open a real browser so the operator can log into a client's channel once, then persist that
      // session so the gatherers can read the channel authenticated.
      const connect = (run: (body: Record<string, unknown>) => Promise<unknown>) =>
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            return res.end()
          }
          const raw = await readBody(req)
          let body: Record<string, unknown> = {}
          try {
            body = JSON.parse(raw || '{}') as Record<string, unknown>
          } catch {
            /* an unparseable body is an empty one */
          }
          try {
            const result = await run(body)
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: String((err as Error)?.message ?? err) }))
          }
        }
      server.middlewares.use(
        '/api/connect/start',
        connect(async (body) => {
          const { startConnect } = await import('./server/connectChannel')
          return startConnect(String(body.url ?? ''))
        }),
      )
      server.middlewares.use(
        '/api/connect/save',
        connect(async (body) => {
          const { saveConnect } = await import('./server/connectChannel')
          return saveConnect(String(body.token ?? ''))
        }),
      )
    },
  }
}

// Server-side secrets read by the /api middleware. These are NOT VITE_-prefixed, so Vite won't
// expose them to the browser; we load them from .env into process.env here so the handlers can
// read them in dev. In production each handler reads the platform's own env vars. A real key
// flips every Claude feature from heuristic to live.
const SERVER_SECRETS = [
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  // The per-tier overrides modelClient documents. They were absent, so setting OPENROUTER_MODEL_COPY
  // in .env silently did nothing in dev and looked like the tier default winning.
  'OPENROUTER_MODEL_EXTRACT',
  'OPENROUTER_MODEL_COPY',
  'OPENROUTER_MODEL_AGENT',
  // Lets an operator pin the models and ignore per-campaign picks (see resolveOpenRouterModel).
  'OPENROUTER_MODEL_LOCK',
  'BUFFER_ACCESS_TOKEN',
  'BUFFER_PROFILE_IDS',
  'RESEND_API_KEY',
  'RESEND_AUDIENCE_ID',
  'RESEND_FROM_EMAIL',
  'YOUTUBE_API_KEY',
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_BUSINESS_ID',
  'LINKEDIN_ACCESS_TOKEN',
  'LINKEDIN_ORG_ID',
  'LINKEDIN_VERSION',
  'NEON_ORG_ID',
  'NEON_API_KEY',
  'NEON_BASE',
]


export default defineConfig(({ mode }) => {
  const cwd = process.cwd()
  const env = loadEnv(mode, cwd, '')
  // A worktree under `.claude/worktrees/` has no `.env` of its own — it is gitignored, so it never
  // gets copied across — and a dev server there reported "No model key set." for every AI feature.
  // Fall back to the main checkout's `.env` for the server secrets. `??` not `||`: a key the
  // worktree defines as blank stays blank, which is how this repo turns a feature off locally.
  const root = mainCheckoutRoot(cwd)
  const shared = root ? loadEnv(mode, root, '') : {}
  for (const key of SERVER_SECRETS) {
    const value = env[key] ?? shared[key]
    if (value && !process.env[key]) process.env[key] = value
  }
  return {
    /**
     * Test runs are about THIS checkout. `.claude/worktrees/` holds git worktrees of the same repo
     * from other sessions, so vitest's default glob walked into them and ran their copies of every
     * test: the suite reported 463 tests where this branch has 165, and a failure in someone else's
     * half-finished branch would have read as a failure here.
     */
    test: {
      exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
    },
    // Don't let test/automation artifacts written into the repo (Playwright MCP
    // logs, screenshots, exported data snapshots) trigger a dev-server reload —
    // a reload resets the in-memory store (clientFilter/brandView) to defaults.
    server: {
      watch: {
        ignored: ['**/.playwright-mcp/**', '**/*.png', '**/public/ww-*.json'],
      },
    },
    // Split heavy vendor code out of the main chunk so first load is smaller and parallelized
    // (clears the >500 kB single-chunk warning; each vendor group is cached independently).
    build: {
      // The vendor split (react / supabase / charts / icons) is done; the remaining ~1 MB is the
      // app's own code. Route-level lazy-loading is a follow-up; bump the warning so builds are clean.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return
            if (/[\\/]recharts[\\/]|[\\/]d3-|[\\/]victory/.test(id)) return 'charts'
            if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
            if (/[\\/]@supabase[\\/]/.test(id)) return 'supabase'
            if (/[\\/]simple-icons[\\/]/.test(id)) return 'icons'
            return 'vendor'
          },
        },
      },
    },
    plugins: [react(), devApi(), agentBridgeApi()],
  }
})
