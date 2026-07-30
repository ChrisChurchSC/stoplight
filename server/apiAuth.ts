/**
 * Auth guard for /api/*. The client sends the signed-in user's Supabase access token as
 * `Authorization: Bearer <token>`; this verifies it with Supabase and answers a bare
 * 401 {"error":"unauthorized"} when it does not check out. The reply says nothing about WHY, so a
 * caller cannot use it to tell an absent token from an expired one.
 *
 * The guard is active ONLY when the server has Supabase configured, which is the same condition
 * connections.ts calls connectionsReady(). That is load bearing, not laziness: Breadcrumbs is
 * designed to run with no backend at all on localStorage, that is how it runs in local dev, and
 * local dev sets neither variable. Enforcing there would lock every developer out of their own
 * machine.
 *
 * Verification is raw REST with the service key, matching connections.ts. The server does not
 * import supabase-js anywhere and one GET is not a reason to start.
 */

// Read per call rather than captured at module load, so a test can toggle the two vars between
// cases without re-importing this module.
const supaUrl = (): string => process.env.VITE_SUPABASE_URL || ''
const anonKey = (): string => process.env.VITE_SUPABASE_ANON_KEY || ''

/**
 * True when the guard enforces.
 *
 * THE CONDITION IS THE CLIENT'S, NOT THE SERVER'S, and getting that backwards is the whole risk in
 * this file. The obvious version mirrors connections.ts and asks for SUPABASE_URL plus
 * SUPABASE_SERVICE_ROLE_KEY, and it is wrong twice over.
 *
 * It is wrong in production, where SUPABASE_SERVICE_ROLE_KEY is not set at all, so the guard would
 * compile, pass its tests, deploy, and quietly never run.
 *
 * It is worse in the deployment where the service key IS set but the build did not receive
 * VITE_SUPABASE_ANON_KEY. The client inlines the VITE_ pair at build time; without them `supabase`
 * is null, so getSession() returns nothing, apiFetch sends no header, AND AuthGate turns into a
 * pass-through that never offers a sign-in screen. Every user would be refused by every endpoint
 * with no way in, while the app still looked healthy because it runs on localStorage.
 *
 * So the guard asks for exactly the two facts the client needs to produce a token in the first
 * place. It cannot then be active in a build whose users could never sign in.
 */
export function authReady(): boolean {
  return !!(supaUrl() && anonKey())
}

/**
 * SHARE LINKS ARE DELIBERATELY NOT A WAY IN, and this is a decision rather than an oversight.
 *
 * AuthGate lets anyone holding a valid ?share= token into the app without an account, because a
 * share token is a self-contained client-side grant rather than a Supabase session. Such a viewer
 * has no access token, so every /api/* call they trigger is refused here.
 *
 * That is the behaviour we want. A share link is a read-only view of work somebody already did, and
 * a link forwarded once is a link forwarded twice: if it carried the right to call the model, then
 * anybody it reached could spend the account's balance. Read the shared campaign, yes. Generate
 * against it, no. If share viewers ever need a model-backed feature, the answer is a scoped token
 * issued for that share, not an exemption here.
 */

// Minimal request/response shapes, structurally compatible with the ones apiRoute.ts and the
// catch-all router already declare (avoids pulling in @vercel/node just for two interfaces).
export interface AuthReq {
  headers: Record<string, string | string[] | undefined>
}
export interface AuthRes {
  statusCode: number
  setHeader(name: string, value: string): void
  end(chunk?: string): void
}

/**
 * Verified tokens, valid until their timestamp. Checking a token is a network round trip and this
 * sits in front of every AI call, so the verdict is worth holding briefly. POSITIVE RESULTS ONLY: a
 * cached rejection would lock a user who has just signed in out for a full minute. The map lives on
 * one warm serverless instance, so it is an optimisation and never a security boundary.
 */
const VERIFIED = new Map<string, number>()
const TTL_MS = 60_000
const MAX_CACHED = 500

function cachedOk(token: string): boolean {
  const expires = VERIFIED.get(token)
  if (expires === undefined) return false
  if (expires <= Date.now()) {
    VERIFIED.delete(token)
    return false
  }
  return true
}

function remember(token: string): void {
  // Bounded so the map cannot grow without limit. Keys hold their insertion order, so the first one
  // out of the iterator is the oldest.
  if (VERIFIED.size >= MAX_CACHED) {
    const now = Date.now()
    for (const [t, expires] of VERIFIED) if (expires <= now) VERIFIED.delete(t)
    while (VERIFIED.size >= MAX_CACHED) {
      const oldest = VERIFIED.keys().next().value
      if (oldest === undefined) break
      VERIFIED.delete(oldest)
    }
  }
  VERIFIED.set(token, Date.now() + TTL_MS)
}

/** The token out of `Authorization: Bearer <token>`, or null when the header is absent/malformed. */
function bearerToken(req: AuthReq): string | null {
  const raw = req.headers?.authorization ?? req.headers?.Authorization
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  const match = value.match(/^Bearer\s+(\S+)$/i)
  return match ? match[1] : null
}

async function verify(token: string): Promise<boolean> {
  try {
    // The ANON key is the right apikey here, and not a compromise for the one we lack. Asking
    // "whose session is this?" needs no elevated privilege: Supabase answers 200 with the user for a
    // live token and refuses everything else. Measured against the real project: no token 401, a
    // junk token 403, and the anon key presented as a bearer token 403, so the public key cannot
    // impersonate a session even though every browser already has it.
    const res = await fetch(`${supaUrl()}/auth/v1/user`, {
      headers: { apikey: anonKey(), authorization: `Bearer ${token}` },
    })
    // Only 200 means valid. An invalid token answers 403 rather than 401, so testing for one status
    // would let the other through.
    if (res.status !== 200) return false
    remember(token)
    return true
  } catch {
    // A Supabase we cannot reach is not a token we can trust, so fail closed.
    return false
  }
}

/**
 * Gate a request. Returns true when it may proceed; when it may not, this has already written the
 * 401 and the caller must return without touching the response.
 */
export async function requireAuth(req: AuthReq, res: AuthRes): Promise<boolean> {
  if (!authReady()) return true
  const token = bearerToken(req)
  if (token && (cachedOk(token) || (await verify(token)))) return true
  res.statusCode = 401
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ error: 'unauthorized' }))
  return false
}
