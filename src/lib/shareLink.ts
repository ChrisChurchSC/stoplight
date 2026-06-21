import type { Role } from '../domain/access'

/**
 * Share links are self-contained: the grant (client + role) is encoded into the
 * token itself, so a recipient needs no account and no server round-trip. This is
 * the mock-first stand-in for signed, server-issued links; revoking only removes
 * the grant from the owner's local list (a real backend would invalidate the token
 * server-side).
 */

export interface ShareGrant {
  id: string
  client: string
  role: Role
  createdAt: string
}

interface TokenPayload {
  c: string
  r: Role
  id: string
}

const b64urlEncode = (s: string): string =>
  btoa(unescape(encodeURIComponent(s))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

const b64urlDecode = (s: string): string =>
  decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))

export function encodeShareToken(grant: { client: string; role: Role; id: string }): string {
  const payload: TokenPayload = { c: grant.client, r: grant.role, id: grant.id }
  return b64urlEncode(JSON.stringify(payload))
}

export function decodeShareToken(token: string): { client: string; role: Role; id: string } | null {
  try {
    const o = JSON.parse(b64urlDecode(token)) as Partial<TokenPayload>
    if (!o.c || !o.r) return null
    return { client: o.c, role: o.r, id: o.id ?? '' }
  } catch {
    return null
  }
}

export function shareUrl(token: string): string {
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}?share=${token}`
}
