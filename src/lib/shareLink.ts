import { isShareableRole, type Role } from '../domain/access'

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
  /** When set, this link grants a SINGLE flow (campaign name), not the whole brand. */
  campaign?: string
  createdAt: string
}

interface TokenPayload {
  c: string
  r: Role
  id: string
  /** Campaign name for a single-flow share. */
  cmp?: string
}

const b64urlEncode = (s: string): string =>
  btoa(unescape(encodeURIComponent(s))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

const b64urlDecode = (s: string): string =>
  decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))

export function encodeShareToken(grant: { client: string; role: Role; id: string; campaign?: string }): string {
  const payload: TokenPayload = { c: grant.client, r: grant.role, id: grant.id }
  if (grant.campaign) payload.cmp = grant.campaign
  return b64urlEncode(JSON.stringify(payload))
}

export function decodeShareToken(token: string): { client: string; role: Role; id: string; campaign?: string } | null {
  try {
    const o = JSON.parse(b64urlDecode(token)) as Partial<TokenPayload>
    // A link can only ever grant a shareable role (stakeholder / editor). Reject
    // a forged token trying to mint owner, even though tokens are unsigned.
    if (!o.c || !isShareableRole(o.r)) return null
    return { client: o.c, role: o.r, id: o.id ?? '', campaign: o.cmp || undefined }
  } catch {
    return null
  }
}

export function shareUrl(token: string): string {
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}?share=${token}`
}
