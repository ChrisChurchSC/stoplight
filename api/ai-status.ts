/** Reports whether a model key is configured server-side (OpenRouter preferred, else Anthropic),
 *  so the client can tell if Claude is connected without exposing the key. GET only. */
interface ApiReq { method?: string }
interface ApiRes { statusCode: number; setHeader(name: string, value: string): void; end(chunk?: string): void }

export default function handler(req: ApiReq, res: ApiRes): void {
  if (req.method !== 'GET') {
    res.statusCode = 405
    return res.end()
  }
  const provider = process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : null
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ connected: !!provider, provider }))
}
