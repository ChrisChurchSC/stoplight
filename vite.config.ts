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

export default defineConfig({
  plugins: [react(), icpReviewApi()],
})
