/**
 * DEV ONLY. Listed in .vercelignore, so this file does not ship: in production /api/ai-credits is
 * served by the catch-all router, which puts it behind the auth guard first.
 *
 * It used to be the exception that proved why that matters. This was the one endpoint file missing
 * from .vercelignore, so it deployed as its own serverless function, bypassed jsonRoute entirely,
 * and returned the account's usage and remaining balance to anyone who asked, verified against the
 * live pilot. The logic now lives in server/aiCredits.ts and both routes share it.
 */
import { readAiCredits } from '../server/aiCredits.js'

export { CREDIT_RATE_USD, creditsFromUsd, readAiCredits, type AiCredits } from '../server/aiCredits.js'

interface ApiReq {
  method?: string
}
interface ApiRes {
  statusCode: number
  setHeader(name: string, value: string): void
  end(chunk?: string): void
}

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  if (req.method !== 'GET') {
    res.statusCode = 405
    return res.end()
  }
  const out = await readAiCredits()
  res.setHeader('content-type', 'application/json')
  // Short cache: the balance moves with every generation, but this must not become a per-render
  // round trip to OpenRouter either.
  res.setHeader('cache-control', 'private, max-age=30')
  res.end(JSON.stringify(out))
}
