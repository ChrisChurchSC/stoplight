import type { PluginOption } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Agent bridge: lets an external MCP server (and so Claude Desktop) drive the
 * running Rushhour browser tab. The browser is the executor: it holds the real
 * Zustand store, so a command runs the ACTUAL app action (add a client, set one
 * up with Claude, run a coherence check) and the UI updates live. No backend,
 * single-user, local-only, dev server only.
 *
 * Transport: SSE for server -> browser (commands), plain POST for browser ->
 * server (results) and for the MCP server -> us (commands to dispatch). One
 * command in flight at a time per id, correlated across the three endpoints.
 * See src/lib/agentBridge.ts (the browser side) and mcp/rushhour-server.mjs.
 */

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}') as Record<string, unknown>)
      } catch {
        resolve({})
      }
    })
  })
}

export function agentBridgeApi(): PluginOption {
  const streams: ServerResponse[] = [] // connected browser SSE streams
  const pending = new Map<string, Pending>()
  let seq = 0

  const send = (res: ServerResponse, event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  return {
    name: 'agent-bridge',
    configureServer(server) {
      // Browser opens the SSE stream and stays connected; it is the executor.
      server.middlewares.use('/api/agent-bridge', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          return res.end()
        }
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })
        streams.push(res)
        send(res, 'ready', { ok: true })
        const hb = setInterval(() => res.write(': hb\n\n'), 25000)
        req.on('close', () => {
          clearInterval(hb)
          const i = streams.indexOf(res)
          if (i >= 0) streams.splice(i, 1)
        })
      })

      // MCP server posts a command to dispatch into the browser tab.
      server.middlewares.use('/api/agent-command', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        const { action, args } = (await readJson(req)) as { action?: string; args?: unknown }
        res.setHeader('content-type', 'application/json')
        const stream = streams[streams.length - 1] // most-recently-connected tab
        if (!stream) {
          res.statusCode = 503
          return res.end(
            JSON.stringify({
              error: 'no-tab',
              message: 'No Rushhour tab is open. Open http://localhost:5173 in a browser and try again.',
            }),
          )
        }
        const id = `c${++seq}`
        const out = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(id)
            reject(new Error('timeout waiting for the Rushhour tab'))
          }, 180000)
          pending.set(id, { resolve, reject, timer })
          send(stream, 'command', { id, action, args })
        }).then(
          (r) => ({ ok: true, result: r }),
          (e) => ({ ok: false, error: String((e as Error)?.message ?? e) }),
        )
        res.end(JSON.stringify(out))
      })

      // Browser posts back the result of a command it ran.
      server.middlewares.use('/api/agent-result', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        const { id, result, error } = (await readJson(req)) as {
          id?: string
          result?: unknown
          error?: string
        }
        const p = id ? pending.get(id) : undefined
        if (p && id) {
          clearTimeout(p.timer)
          pending.delete(id)
          if (error) p.reject(new Error(error))
          else p.resolve(result)
        }
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ ok: !!p }))
      })
    },
  }
}
