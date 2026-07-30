import { getSession } from './session'

/**
 * Drop-in replacement for fetch() on our own /api/* routes: same signature, same
 * return type, plus the signed-in user's Supabase access token as a bearer.
 *
 * When there is no session (signed out, or no Supabase configured at all) the
 * request goes out untouched. That is the local-dev path: Breadcrumbs runs with
 * no backend on localStorage, and the server-side guard is likewise inert unless
 * Supabase is configured, so an unauthenticated request still succeeds there.
 *
 * A 401 is returned to the caller as-is. Retrying, redirecting or signing the
 * user out here would turn any transient failure into a lockout.
 */

/**
 * A 401 happened, so something can say so.
 *
 * This exists because of how the callers behave, not because they are wrong. Nearly every adapter
 * treats a non-ok reply as "the backend is not there" and quietly returns heuristic output, which is
 * the right instinct for a missing model key and exactly wrong for a refused session: an auth
 * problem would present as "AI unavailable, using the local fallback" and nobody would learn that
 * they were signed out. The event changes no control flow, so no adapter behaves differently and a
 * transient failure still cannot lock anyone out. It only makes an otherwise invisible state
 * observable to whatever wants to surface it.
 */
export const API_UNAUTHORIZED_EVENT = 'breadcrumbs:api-unauthorized'

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let token: string | undefined
  try {
    token = (await getSession())?.access_token
  } catch {
    // A failure to read the session is not a reason to drop the request: send it
    // unauthenticated and let the server decide.
  }

  // Headers() normalises whatever shape the caller passed (object, array, Headers),
  // so caller-supplied headers such as content-type survive.
  let res: Response
  if (!token) {
    res = await fetch(input, init)
  } else {
    const headers = new Headers(init?.headers)
    headers.set('authorization', `Bearer ${token}`)
    res = await fetch(input, { ...init, headers })
  }

  if (res.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(API_UNAUTHORIZED_EVENT, { detail: { hadToken: !!token } }))
  }
  return res
}
