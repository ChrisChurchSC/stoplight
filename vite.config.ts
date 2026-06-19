import { defineConfig, type PluginOption } from 'vite'
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

export default defineConfig({
  plugins: [react(), icpReviewApi(), publishApi(), draftCopyApi()],
})
