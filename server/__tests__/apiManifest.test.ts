import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API_ROUTES, lookupRoute } from '../apiManifest.js'
import { DEV_JSON_ROUTES, DEV_STREAM_ROUTES } from '../devApiManifest.js'

/**
 * The drift guard.
 *
 * Three times now, a route has existed in one environment and not the other, and each time it
 * shipped: "describe this card and fill it in", "fill this in from the site" and the per-field
 * suggestions had dev middleware and no production entry, so they worked on localhost and 404'd on
 * the pilot; `draft-ctas` had the reverse. Separately, api/ai-credits.ts escaped the deny-list and
 * deployed as its own unauthenticated function that answered the account balance to anyone.
 *
 * None of those were hard to see once someone looked. The problem was that nothing looked. These
 * tests are the thing that looks — they read the manifests, the client's call sites and the api/
 * directory, and fail when the three stop agreeing.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')

/**
 * Routes the production router answers inline rather than through the manifest: plain GETs, the
 * Google OAuth bounce (which cannot carry a bearer token, so it cannot be a manifest route), and
 * the paste-a-key connect flow. They have no dev equivalent by design.
 */
const PROD_ONLY_INLINE = ['ai-status', 'ai-credits', 'actuals', 'google-connect', 'google-callback', 'connect-resend']

/**
 * Local-only routes, documented in DEPLOY.md. The UI degrades when they 404 in production.
 *
 * `connect/*` opens a headed browser and shares an in-process Map between its two calls.
 * `agent-bridge` / `agent-result` are the SSE channel the MCP server drives this tab through
 * (server/agentBridge.ts); the client half is behind `import.meta.env.DEV` in App.tsx.
 */
const DEV_ONLY = [
  ...Object.keys(DEV_JSON_ROUTES),
  ...Object.keys(DEV_STREAM_ROUTES),
  'connect/start',
  'connect/save',
  'agent-bridge',
  'agent-result',
]

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/**
 * Every import form the graph walk below has to recognise.
 *
 * The first pattern matches across newlines on purpose. An earlier version used `[^'"\n]*`, which
 * stops at the first line break, so a wrapped `import {\n  chromium,\n} from 'playwright'` matched
 * nothing — and a missed edge is not one missed specifier, it silently drops that module's whole
 * subtree. server/aggregatorHandler.ts already imports across eight lines inside the production
 * graph, so this was not hypothetical. `[^'"]*?` is lazy and cannot cross a quote, so it still stops
 * inside the statement it started in.
 */
const IMPORT_FORMS = [
  /(?:^|\n)\s*(?:import|export)\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
  /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g, // side-effect: import 'playwright'
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
]

describe('api manifest', () => {
  it('every production route resolves to a real handler function', async () => {
    // A renamed or deleted export is otherwise invisible until someone calls the endpoint: the
    // dynamic import only runs on request, so both typecheck and build stay green.
    for (const [name, load] of Object.entries(API_ROUTES)) {
      const handler = await load()
      expect(typeof handler, `${name} did not resolve to a function`).toBe('function')
    }
  })

  it('every dev-only route resolves to a real handler function', async () => {
    for (const [name, load] of Object.entries({ ...DEV_JSON_ROUTES, ...DEV_STREAM_ROUTES })) {
      const handler = await load()
      expect(typeof handler, `${name} did not resolve to a function`).toBe('function')
    }
  })

  it('no route is declared both as production and as dev-only', () => {
    const overlap = Object.keys(API_ROUTES).filter((name) => DEV_ONLY.includes(name))
    expect(overlap, 'a route must be in exactly one manifest').toEqual([])
  })

  it('serves both environments from the same list', () => {
    // vite.config.ts must mount the production manifest rather than re-declaring routes. If someone
    // adds a bare server.middlewares.use('/api/...') back, that route exists only in dev again.
    const config = read('vite.config.ts')
    expect(config).toContain("from './server/apiManifest'")

    const handWired = [...config.matchAll(/middlewares\.use\(\s*'\/api\/([a-z0-9-]+)'/g)].map((m) => m[1])
    const allowed = new Set([...PROD_ONLY_INLINE, ...DEV_ONLY])
    const strays = handWired.filter((name) => !allowed.has(name))
    expect(strays, 'route hand-wired in dev but not in a manifest').toEqual([])
  })

  it('answers every /api path the client calls', () => {
    // The failure this catches is quiet: setupGenerator catches its own 404 and falls back to a
    // name derived from the domain, so a missing route reads as a worse answer, not an error.
    const known = new Set([...Object.keys(API_ROUTES), ...PROD_ONLY_INLINE, ...DEV_ONLY])
    const called = new Set<string>()
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`
        if (entry.isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(entry.name)) {
          for (const m of read(rel).matchAll(/['"`]\/api\/([a-z0-9/-]+)['"`]/g)) called.add(m[1])
        }
      }
    }
    walk('src')

    const unroutable = [...called].filter((name) => !known.has(name))
    expect(unroutable, 'client calls an /api path no manifest serves').toEqual([])
  })

  it('deploys exactly one serverless function', () => {
    // Vercel's Hobby plan caps a deployment at 12. Every file in api/ is a function, and the
    // per-endpoint files that used to live here are what made the cap a live concern.
    //
    // Only source files count, and the listing is sorted: a raw readdir also picks up the .DS_Store
    // that Finder writes the moment anyone opens the folder, which is gitignored — so the test went
    // red claiming a second function was deploying while git reported nothing to see.
    const functions = readdirSync(join(ROOT, 'api'))
      .filter((name) => /\.[cm]?[jt]sx?$/.test(name))
      .sort()
    expect(functions).toEqual(['[...path].ts'])
  })

  it('keeps the browser-automation graph out of the deployed bundle', () => {
    // playwright is a devDependency and its browsers are not in a function bundle, so a static
    // import of it from the catch-all bloats the one deployed function and breaks the build
    // outright under --omit=dev. extract-copy reached it for real, through a stray NoKeyError
    // import, and shipped that way.
    const resolveLocal = (spec: string, from: string) => {
      if (!spec.startsWith('.')) return null
      const base = resolve(dirname(from), spec).replace(/\.js$/, '')
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        try {
          readFileSync(base + ext)
          return base + ext
        } catch {
          /* try the next extension */
        }
      }
      return null
    }

    const seen = new Set<string>()
    const offenders: string[] = []
    const walk = (file: string) => {
      if (seen.has(file)) return
      seen.add(file)
      let src: string
      try {
        src = readFileSync(file, 'utf8')
      } catch {
        return
      }
      const specs = new Set(IMPORT_FORMS.flatMap((form) => [...src.matchAll(form)].map((m) => m[1])))
      for (const spec of specs) {
        if (/^(playwright|playwright-core|puppeteer)/.test(spec)) offenders.push(`${file} imports ${spec}`)
        const next = resolveLocal(spec, file)
        if (next) walk(next)
      }
    }
    walk(join(ROOT, 'api/[...path].ts'))

    expect(offenders).toEqual([])
  })

  it('404s on inherited Object properties instead of crashing', () => {
    // API_ROUTES is an object literal, so a bare API_ROUTES[path] also answers for everything on
    // Object.prototype: /api/toString reached jsonRoute with a non-handler and 500'd with a raw
    // TypeError, and /api/__proto__ threw outside the try/catch as an unhandled rejection.
    for (const key of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(lookupRoute(key), `${key} should not resolve to a handler`).toBeNull()
    }
    expect(typeof lookupRoute('claude-ask')).toBe('function')
  })
})
