import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { requireAuth } from '../apiAuth.js'
import { jsonRoute } from '../apiRoute.js'

/**
 * The guard in front of every /api/* call.
 *
 * Two failure modes are worth locking down. One is enforcing when Supabase is NOT configured, which
 * would 401 every request on a machine running the app the way it is designed to run (no backend,
 * localStorage only). The other is caching a rejection, which would keep a user who has just signed
 * in locked out for the length of the TTL.
 *
 * Supabase is a network call, so fetch is stubbed. Each case uses its own token string: the verified
 * cache is module state and lives for the whole file.
 */

const fetchMock = vi.fn()

/** Supabase's answer to GET /auth/v1/user, reduced to the one field the guard reads. */
const supabaseSays = (ok: boolean, status = ok ? 200 : 403) => fetchMock.mockResolvedValue({ ok, status })

function fakeRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as string | undefined,
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
    end(chunk?: string) {
      this.body = chunk
    },
  }
}

const req = (headers: Record<string, string | string[] | undefined> = {}) => ({ headers })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  process.env.VITE_SUPABASE_URL = 'https://project.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.VITE_SUPABASE_URL
  delete process.env.VITE_SUPABASE_ANON_KEY
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

describe('requireAuth with Supabase unconfigured', () => {
  it('passes every request through, including one with no header at all', async () => {
    delete process.env.VITE_SUPABASE_URL
    delete process.env.VITE_SUPABASE_ANON_KEY
    const res = fakeRes()

    expect(await requireAuth(req(), res)).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still passes through when only one of the two vars is set', async () => {
    delete process.env.VITE_SUPABASE_ANON_KEY
    const res = fakeRes()

    expect(await requireAuth(req(), res)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  /**
   * THE LOCKOUT THIS CONDITION EXISTS TO PREVENT. The server-only names are what connections.ts
   * uses, and gating on them is the obvious mistake. The client inlines the VITE_ pair at BUILD
   * time, so a deployment holding only these two would refuse every request from a client that
   * could never obtain a token, behind an AuthGate that never offers a sign-in screen either. The
   * pilot happens to have both pairs set, so the wrong condition would work there by luck; this
   * test is what stops the luck being mistaken for a design.
   */
  it('stays inert when only the server-side names are set, so no build can lock its users out', async () => {
    delete process.env.VITE_SUPABASE_URL
    delete process.env.VITE_SUPABASE_ANON_KEY
    process.env.SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    const res = fakeRes()

    expect(await requireAuth(req(), res)).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('requireAuth when active', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = fakeRes()

    expect(await requireAuth(req(), res)).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.headers['content-type']).toBe('application/json')
    expect(res.body).toBe('{"error":"unauthorized"}')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed header without asking Supabase', async () => {
    for (const value of ['token-without-scheme', 'Basic abc123', 'Bearer', 'Bearer ']) {
      const res = fakeRes()
      expect(await requireAuth(req({ authorization: value }), res)).toBe(false)
      expect(res.statusCode).toBe(401)
      expect(res.body).toBe('{"error":"unauthorized"}')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a token Supabase does not recognise', async () => {
    supabaseSays(false)
    const res = fakeRes()

    expect(await requireAuth(req({ authorization: 'Bearer bad-token' }), res)).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body).toBe('{"error":"unauthorized"}')
  })

  /**
   * Measured against the real project: an absent token answers 401, an invalid one 403, and the
   * public anon key presented as a bearer token also 403. Only 200 may be treated as valid, so
   * testing for a single failure status would let the others through.
   */
  it('accepts nothing but a 200, including the 403 a live project returns for a bad token', async () => {
    for (const status of [401, 403, 400, 404, 500]) {
      fetchMock.mockReset()
      fetchMock.mockResolvedValue({ ok: false, status })
      const res = fakeRes()
      expect(await requireAuth(req({ authorization: `Bearer token-${status}` }), res)).toBe(false)
      expect(res.statusCode).toBe(401)
    }
  })

  it('accepts a token Supabase recognises, and says nothing on the response', async () => {
    supabaseSays(true)
    const res = fakeRes()

    expect(await requireAuth(req({ authorization: 'Bearer good-token-1' }), res)).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBeUndefined()
  })

  it('verifies against /auth/v1/user with the anon key as apikey and the user token as bearer', async () => {
    supabaseSays(true)
    await requireAuth(req({ authorization: 'Bearer good-token-2' }), fakeRes())

    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(url).toBe('https://project.supabase.co/auth/v1/user')
    expect(init.headers.apikey).toBe('anon-key')
    expect(init.headers.authorization).toBe('Bearer good-token-2')
  })

  it('rejects when Supabase is unreachable, rather than failing open', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const res = fakeRes()

    expect(await requireAuth(req({ authorization: 'Bearer good-token-3' }), res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })
})

describe('the verified cache', () => {
  it('checks a good token once and serves the second call from memory', async () => {
    supabaseSays(true)

    expect(await requireAuth(req({ authorization: 'Bearer cached-token' }), fakeRes())).toBe(true)
    expect(await requireAuth(req({ authorization: 'Bearer cached-token' }), fakeRes())).toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never caches a rejection, so a token that goes good is accepted immediately', async () => {
    supabaseSays(false)
    expect(await requireAuth(req({ authorization: 'Bearer flips-token' }), fakeRes())).toBe(false)

    supabaseSays(true)
    expect(await requireAuth(req({ authorization: 'Bearer flips-token' }), fakeRes())).toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('jsonRoute', () => {
  const route = (handler: (body: unknown) => Promise<unknown>) => jsonRoute(handler)

  it('runs the handler for a valid token', async () => {
    supabaseSays(true)
    const handler = vi.fn(async () => ({ ok: true }))
    const res = fakeRes()

    await route(handler)({ method: 'POST', headers: { authorization: 'Bearer route-token' }, body: {} }, res)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('{"ok":true}')
  })

  it('401s without running the handler when the token is missing', async () => {
    const handler = vi.fn(async () => ({ ok: true }))
    const res = fakeRes()

    await route(handler)({ method: 'POST', headers: {}, body: {} }, res)

    expect(handler).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res.body).toBe('{"error":"unauthorized"}')
  })

  it('maps a spent budget to 501, the status the client falls back on', async () => {
    supabaseSays(true)
    const spent = Object.assign(new Error('OpenRouter 402'), { code: 'NO_BUDGET' })
    const res = fakeRes()

    await route(async () => {
      throw spent
    })({ method: 'POST', headers: { authorization: 'Bearer route-token' }, body: {} }, res)

    expect(res.statusCode).toBe(501)
    expect(res.body).toBe('{"error":"NO_BUDGET"}')
  })
})
