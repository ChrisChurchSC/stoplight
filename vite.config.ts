import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { agentBridgeApi } from './server/agentBridge'

/**
 * Dev-server endpoint for the real ICP review. Keeps the Anthropic key
 * server-side. For production this same handler moves to a serverless function;
 * the client calls the same /api/icp-review path either way.
 */
function icpReviewApi(): PluginOption {
  return {
    name: 'icp-review-api',
    configureServer(server) {
      server.middlewares.use('/api/icp-review', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runIcpReview } = await import('./server/icpReviewHandler')
            const result = await runIcpReview(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for real publishing (Buffer). Keeps the Buffer token
 * server-side; mirrors /api/icp-review. Moves to a serverless function for prod.
 */
function publishApi(): PluginOption {
  return {
    name: 'publish-api',
    configureServer(server) {
      server.middlewares.use('/api/publish', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runPublish } = await import('./server/publishHandler')
            const result = await runPublish(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for real email publishing (Resend). Keeps the Resend key
 * server-side; mirrors /api/publish. Moves to a serverless function for prod.
 */
function publishEmailApi(): PluginOption {
  return {
    name: 'publish-email-api',
    configureServer(server) {
      server.middlewares.use('/api/publish-email', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runPublishEmail } = await import('./server/resendHandler')
            const result = await runPublishEmail(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for real starter-copy drafting. Keeps the Anthropic key
 * server-side; mirrors /api/icp-review. Moves to a serverless function for prod.
 */
function draftCopyApi(): PluginOption {
  return {
    name: 'draft-copy-api',
    configureServer(server) {
      server.middlewares.use('/api/draft-copy', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runCopyDraft } = await import('./server/copyDraftHandler')
            const result = await runCopyDraft(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for generating one personalization-matrix cell's copy with
 * Claude. Keeps the key server-side; mirrors /api/draft-copy. 501 when no key, so
 * the client falls back to the deterministic composer.
 */
function draftCellApi(): PluginOption {
  return {
    name: 'draft-cell-api',
    configureServer(server) {
      server.middlewares.use('/api/draft-cell', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runDraftCell } = await import('./server/draftCellHandler')
            const result = await runDraftCell(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for "Claude sets up the workspace". Reads the team's site
 * server-side and generates a proposed config. Keeps the key private; mirrors
 * /api/icp-review. Moves to a serverless function for prod.
 */
function setupApi(): PluginOption {
  return {
    name: 'setup-api',
    configureServer(server) {
      server.middlewares.use('/api/setup', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runSetup } = await import('./server/setupHandler')
            const result = await runSetup(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for "Ask Claude" (conversational connection / what-worked).
 * Keeps the Anthropic key server-side; mirrors /api/icp-review. Moves to a
 * serverless function for prod.
 */
function askApi(): PluginOption {
  return {
    name: 'ask-api',
    configureServer(server) {
      server.middlewares.use('/api/claude-ask', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runAsk } = await import('./server/askHandler')
            const result = await runAsk(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

// Server-side secrets read by the /api middleware. These are NOT VITE_-prefixed,
// so Vite won't expose them to the browser; we load them from .env into
// process.env here so the handlers (icp-review, draft-copy, setup, claude-ask,
// publish) can read them in dev. In production each handler reads the platform's
// own env vars. A real key flips every Claude feature from heuristic to live.
const SERVER_SECRETS = [
  'ANTHROPIC_API_KEY',
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
]

/**
 * Dev-server endpoint for the Claude-powered coherence check (the connection
 * check itself). Keeps the Anthropic key server-side; mirrors /api/icp-review.
 */
function coherenceApi(): PluginOption {
  return {
    name: 'coherence-api',
    configureServer(server) {
      server.middlewares.use('/api/coherence-check', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runCoherenceCheck } = await import('./server/coherenceHandler')
            const result = await runCoherenceCheck(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for the current-state messaging map: crawl + ads in,
 * structured live messaging out. Keeps the key server-side; mirrors /api/setup.
 */
function siteMapApi(): PluginOption {
  return {
    name: 'site-map-api',
    configureServer(server) {
      server.middlewares.use('/api/map-site', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runSiteMap } = await import('./server/siteMapHandler')
            const result = await runSiteMap(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Streaming variant of /api/map-site: emits stage progress over SSE (so the
 * onboarding UI can show the work) then the final map. Mirrors the JSON route.
 */
function siteMapStreamApi(): PluginOption {
  return {
    name: 'site-map-stream-api',
    configureServer(server) {
      server.middlewares.use('/api/map-site-stream', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const send = (event: string, data: unknown) =>
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          try {
            const { runSiteMap } = await import('./server/siteMapHandler')
            const result = await runSiteMap(JSON.parse(body || '{}'), (e) => send('progress', e))
            send('result', result)
          } catch (err) {
            const code = (err as { code?: string })?.code
            send('error', { code: code ?? null, message: String((err as Error)?.message ?? err) })
          } finally {
            res.end()
          }
        })
      })
    },
  }
}

/**
 * Connect-a-channel endpoints: open a real browser to log into a client's channel
 * once (/start), then persist that session (/save) so Claude can read the channel
 * authenticated. Local/dev only — opens a visible browser window for the login.
 */
function connectApi(): PluginOption {
  const readBody = (req: import('node:http').IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve) => {
      let b = ''
      req.on('data', (c) => (b += c))
      req.on('end', () => {
        try {
          resolve(JSON.parse(b || '{}') as Record<string, unknown>)
        } catch {
          resolve({})
        }
      })
    })
  const handle = (run: (body: Record<string, unknown>) => Promise<unknown>) => async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      return res.end()
    }
    try {
      const result = await run(await readBody(req))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (err) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: String((err as Error)?.message ?? err) }))
    }
  }
  return {
    name: 'connect-api',
    configureServer(server) {
      server.middlewares.use(
        '/api/connect/start',
        handle(async (body) => {
          const { startConnect } = await import('./server/connectChannel')
          return startConnect(String(body.url ?? ''))
        }),
      )
      server.middlewares.use(
        '/api/connect/save',
        handle(async (body) => {
          const { saveConnect } = await import('./server/connectChannel')
          return saveConnect(String(body.token ?? ''))
        }),
      )
    },
  }
}

/**
 * Streaming per-channel ingest: link one channel and pull all of its copy —
 * including the copy baked into the art (vision reads on-image text). Emits stage
 * progress over SSE, then the final channel map. Mirrors /api/map-site-stream.
 */
function ingestChannelApi(): PluginOption {
  return {
    name: 'ingest-channel-api',
    configureServer(server) {
      server.middlewares.use('/api/ingest-channel', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const send = (event: string, data: unknown) =>
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          try {
            const { runIngestChannel } = await import('./server/ingestChannelHandler')
            const result = await runIngestChannel(JSON.parse(body || '{}'), (e) => send('progress', e))
            send('result', result)
          } catch (err) {
            const code = (err as { code?: string })?.code
            send('error', { code: code ?? null, message: String((err as Error)?.message ?? err) })
          } finally {
            res.end()
          }
        })
      })
    },
  }
}

/**
 * Streaming ingest of a brand's owned content from their Sanity CMS: query the
 * dataset, harvest the copy, map it. Emits stage progress over SSE; mirrors
 * /api/ingest-channel (no vision — Sanity is the source of record).
 */
function ingestSanityApi(): PluginOption {
  return {
    name: 'ingest-sanity-api',
    configureServer(server) {
      server.middlewares.use('/api/ingest-sanity', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const send = (event: string, data: unknown) =>
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          try {
            const { runSanityIngest } = await import('./server/sanityIngestHandler')
            const result = await runSanityIngest(JSON.parse(body || '{}'), (e) => send('progress', e))
            send('result', result)
          } catch (err) {
            const code = (err as { code?: string })?.code
            send('error', { code: code ?? null, message: String((err as Error)?.message ?? err) })
          } finally {
            res.end()
          }
        })
      })
    },
  }
}

/**
 * Streaming ingest of a brand's email copy from Resend: list broadcasts, pull
 * their copy, map it into the email channel. Mirrors /api/ingest-sanity.
 */
function ingestResendApi(): PluginOption {
  return {
    name: 'ingest-resend-api',
    configureServer(server) {
      server.middlewares.use('/api/ingest-resend', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const send = (event: string, data: unknown) =>
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          try {
            const { runResendIngest } = await import('./server/resendIngestHandler')
            const result = await runResendIngest(JSON.parse(body || '{}'), (e) => send('progress', e))
            send('result', result)
          } catch (err) {
            const code = (err as { code?: string })?.code
            send('error', { code: code ?? null, message: String((err as Error)?.message ?? err) })
          } finally {
            res.end()
          }
        })
      })
    },
  }
}

/**
 * Streaming ingest of a brand's live Google Ads copy via the Google Ads API:
 * OAuth token exchange, GAQL ad-text query, map into paid Google channels.
 * Mirrors /api/ingest-sanity.
 */
function ingestGoogleAdsApi(): PluginOption {
  return {
    name: 'ingest-google-ads-api',
    configureServer(server) {
      server.middlewares.use('/api/ingest-google-ads', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const send = (event: string, data: unknown) =>
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          try {
            const { runGoogleAdsIngest } = await import('./server/googleAdsIngestHandler')
            const result = await runGoogleAdsIngest(JSON.parse(body || '{}'), (e) => send('progress', e))
            send('result', result)
          } catch (err) {
            const code = (err as { code?: string })?.code
            send('error', { code: code ?? null, message: String((err as Error)?.message ?? err) })
          } finally {
            res.end()
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for reading the copy inside a single creative (vision OCR).
 * Backs the row-level extractCopy action; mirrors /api/icp-review.
 */
function extractCopyApi(): PluginOption {
  return {
    name: 'extract-copy-api',
    configureServer(server) {
      server.middlewares.use('/api/extract-copy', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runExtractCopy } = await import('./server/extractCopyHandler')
            const result = await runExtractCopy(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

/**
 * Dev-server endpoint for the Claude engine — the agent that reads from sources
 * and publishes to channels by calling tools. Keeps the Anthropic key server-side.
 */
function agentApi(): PluginOption {
  return {
    name: 'agent-api',
    configureServer(server) {
      server.middlewares.use('/api/claude-agent', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { runAgent } = await import('./server/agentHandler')
            const result = await runAgent(JSON.parse(body || '{}'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            const code = (err as { code?: string })?.code
            res.statusCode = code === 'NO_KEY' ? 501 : 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: code ?? String((err as Error)?.message ?? err) }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of SERVER_SECRETS) {
    if (env[key] && !process.env[key]) process.env[key] = env[key]
  }
  return {
    // Don't let test/automation artifacts written into the repo (Playwright MCP
    // logs, screenshots, exported data snapshots) trigger a dev-server reload —
    // a reload resets the in-memory store (clientFilter/brandView) to defaults.
    server: {
      watch: {
        ignored: ['**/.playwright-mcp/**', '**/*.png', '**/public/ww-*.json'],
      },
    },
    plugins: [
      react(),
      icpReviewApi(),
      publishApi(),
      publishEmailApi(),
      draftCopyApi(),
      draftCellApi(),
      setupApi(),
      askApi(),
      coherenceApi(),
      agentApi(),
      siteMapApi(),
      siteMapStreamApi(),
      connectApi(),
      ingestChannelApi(),
      ingestSanityApi(),
      ingestResendApi(),
      ingestGoogleAdsApi(),
      extractCopyApi(),
      agentBridgeApi(),
    ],
  }
})
