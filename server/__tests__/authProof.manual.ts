/**
 * Does the guard actually fire in a production-shaped process?
 *
 * The unit tests mock the Supabase call, and `npm run dev` bypasses jsonRoute entirely (vite.config
 * serves /api itself), so neither exercises what ships. This drives the REAL api/[...path].ts router
 * in-process against the REAL Supabase project and asserts the status an anonymous caller gets.
 *
 * Two modes, and they MUST be separate processes: server modules read process.env at module scope
 * and Node caches the module, so flipping the env after the first import proves nothing.
 *
 *   npx tsx server/__tests__/authProof.manual.ts prod    Supabase configured, as in production. Everything must 401.
 *   npx tsx server/__tests__/authProof.manual.ts local   No Supabase, as on a dev machine. Nothing may 401.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Repo root, derived rather than hardcoded so this runs from any checkout.
const REPO = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')
const mode = process.argv[2] === 'local' ? 'local' : 'prod'

const env = Object.fromEntries(
  readFileSync(`${REPO}/.env`, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
    }),
)

// Set env BEFORE the router (and everything it pulls in) is imported.
for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[k]
}
if (mode === 'prod') {
  process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL
  process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY
}
// Deliberately invalid so a request that DOES get through cannot bill anything.
process.env.OPENROUTER_API_KEY = 'invalid-on-purpose-nothing-is-billed'

function fakeRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(n: string, v: string) {
      this.headers[n] = v
    },
    end(c?: string) {
      this.body = c ?? ''
    },
  }
}

const results: string[] = []
function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name} (${detail})`)
}

async function main() {
  const mod = await import(`${REPO}/api/[...path].ts`)
  const router = mod.default as (req: unknown, res: unknown) => Promise<void>

  const call = async (path: string, o: { token?: string; method?: string; body?: unknown } = {}) => {
    const res = fakeRes()
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (o.token) headers.authorization = `Bearer ${o.token}`
    await router({ method: o.method ?? 'POST', url: path, body: o.body ?? {}, headers }, res)
    return { status: res.statusCode, body: res.body.slice(0, 160) }
  }

  if (mode === 'prod') {
    console.log('MODE: prod shape (Supabase configured). Anonymous callers must be refused.\n')
    const cases: [string, Awaited<ReturnType<typeof call>>][] = [
      ['draft-copy, no token', await call('/api/draft-copy')],
      ['draft-copy, garbage token', await call('/api/draft-copy', { token: 'not-a-real-token' })],
      ['draft-copy, PUBLIC anon key as token', await call('/api/draft-copy', { token: env.VITE_SUPABASE_ANON_KEY })],
      ['flow-agent (Gretel), no token', await call('/api/flow-agent')],
      ['aggregator, no token', await call('/api/aggregator', { body: { op: 'status' } })],
      ['actuals GET, no token', await call('/api/actuals?brand=x', { method: 'GET' })],
      ['ai-status GET, no token', await call('/api/ai-status', { method: 'GET' })],
      ['ai-credits GET, no token (was leaking the balance)', await call('/api/ai-credits', { method: 'GET' })],
    ]
    for (const [name, r] of cases) {
      check(name, r.status === 401, `status ${r.status}${r.status !== 401 ? ' body ' + r.body : ''}`)
    }
  } else {
    console.log('MODE: local shape (no Supabase). Nothing may be refused, or every dev is locked out.\n')
    const cases: [string, Awaited<ReturnType<typeof call>>][] = [
      ['draft-copy, no token', await call('/api/draft-copy')],
      ['flow-agent, no token', await call('/api/flow-agent')],
      ['aggregator, no token', await call('/api/aggregator', { body: { op: 'status' } })],
    ]
    for (const [name, r] of cases) {
      check(name, r.status !== 401, `status ${r.status}`)
    }
  }

  console.log(results.join('\n'))
  const failed = results.filter((r) => r.startsWith('FAIL')).length
  console.log(`\n${mode.toUpperCase()}: ${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`)
  process.exit(failed === 0 ? 0 : 1)
}

void main()
