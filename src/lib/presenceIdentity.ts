import { SHARE_ROOM_KEY, type PresenceIdentity } from '../domain/livePresence'
import { firstNameOf, getActiveWorkspaceId, getSession } from './session'

/**
 * Who this tab is on the canvas, and which room it belongs in.
 *
 * Both answers are asynchronous and neither is knowable at import time — the account arrives with
 * the session, the workspace with a lookup — so this is resolved once per mount and handed to the
 * transport, rather than being read inline where a cursor is drawn.
 *
 * The interesting case is the one with no account at all. A ?share= recipient is now a visible
 * participant, which they were never able to be while presence ran on a same-browser channel. They
 * have no session to take a name from and no workspace to take a room from, so they take the room
 * from the link they were sent: maybeHydrateShare looks up the workspace that published their
 * snapshot and leaves it here on the way past. That lookup is granted to anon and returns an
 * opaque uuid to a caller who already holds the link it belongs to — see migrations/0014.
 */

const TAB_KEY = 'stoplight.presence.tab'

/**
 * Per-tab and stable across reloads of that tab, so a refresh mid-session does not read as one
 * person leaving and a stranger arriving.
 */
export function tabId(): string {
  try {
    const saved = sessionStorage.getItem(TAB_KEY)
    if (saved) return saved
  } catch {
    /* no sessionStorage — fall through to an in-memory id for this mount */
  }
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `tab_${crypto.randomUUID()}`
      : `tab_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`
  try {
    sessionStorage.setItem(TAB_KEY, id)
  } catch {
    /* ignore */
  }
  return id
}

export { SHARE_ROOM_KEY }

export interface ResolvedPresence {
  identity: PresenceIdentity
  workspaceId: string | null
}

export async function resolvePresence(opts: { shared: boolean }): Promise<ResolvedPresence> {
  const id = tabId()

  if (opts.shared) {
    let room: string | null = null
    try {
      room = sessionStorage.getItem(SHARE_ROOM_KEY)
    } catch {
      room = null
    }
    return {
      // Guests are told apart by colour, not by name. Numbering them would need the room to agree
      // on an order, and a wrong number is worse than an honest "someone you sent this to".
      identity: { id, colorSeed: id, name: 'Guest', role: 'viewer' },
      workspaceId: room,
    }
  }

  const session = await getSession()
  const user = session?.user ?? null
  if (!user) return { identity: { id, colorSeed: id, name: 'Guest', role: 'viewer' }, workspaceId: null }

  return {
    identity: {
      id,
      // The account, so one person is one colour on every device they open the board on.
      colorSeed: user.id,
      name: firstNameOf(user) || 'Someone',
      role: 'editor',
    },
    workspaceId: await getActiveWorkspaceId(),
  }
}
