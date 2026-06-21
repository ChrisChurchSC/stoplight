import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'

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
const SERVER_SECRETS = ['ANTHROPIC_API_KEY', 'BUFFER_ACCESS_TOKEN', 'BUFFER_PROFILE_IDS']

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of SERVER_SECRETS) {
    if (env[key] && !process.env[key]) process.env[key] = env[key]
  }
  return {
    plugins: [react(), icpReviewApi(), publishApi(), draftCopyApi(), setupApi(), askApi()],
  }
})
