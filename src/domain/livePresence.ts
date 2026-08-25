/**
 * Who else is on the board, and which room "else" is scoped to.
 *
 * The multiplayer cursors were built against a BroadcastChannel, which reaches other tabs of the
 * same browser on the same machine and nothing further. That demos perfectly and ships nothing:
 * two people on two laptops each saw an empty canvas and a "1 here" pill. The transport now goes
 * over the network, and these are the rules that transport needs, kept pure so they can be read
 * and tested without standing up a socket.
 *
 * Three things are decided here, and each of them was a real bug waiting in the local version:
 *
 *  - THE ROOM. A network channel is only as private as its name. Brand names are short, guessable
 *    and shared with the client, so a room called "ABM" would let anyone holding the public anon
 *    key watch a named colleague move around a named brand. The workspace id is an opaque uuid
 *    nobody can guess, so it goes in front. No workspace, no room: presence is off rather than
 *    global.
 *
 *  - THE NAME. The local version dealt everyone a fake name from a hardcoded list — Dana Reyes,
 *    Sam Ito, Priya Shah. Fine for a demo of the idea, useless the moment the cursors are real:
 *    watching "Priya Shah" drag a card tells you nothing about who is actually in your campaign.
 *
 *  - WHO MAY MOVE THINGS. A ?share= recipient is read-only by construction, and now appears on
 *    the canvas as a guest. Broadcast payloads are client-authored, so a viewer's move is refused
 *    at BOTH ends: they do not send one, and nobody applies one that arrives claiming to be from
 *    a viewer. A rule enforced only by the sender is not a rule.
 */

/**
 * Where a share view leaves the workspace that published its snapshot, for the presence room to
 * be built from. It is written during hydration, long before the app chunk is imported, so there
 * is no live module instance to hand it through — and it must not outlive the tab.
 */
export const SHARE_ROOM_KEY = 'stoplight.presence.shareRoom'

export type PresenceRole = 'editor' | 'viewer'

/** Who this tab is, on the wire. */
export interface PresenceIdentity {
  /**
   * Per TAB, not per account. Two tabs of one account are two cursors, which is both what the
   * BroadcastChannel version did and what every canvas tool does — a second window is a second
   * place you are looking from, and collapsing them would make one of them freeze mid-drag.
   */
  id: string
  /**
   * What the colour is drawn from. The account id when there is one, so you are the same colour
   * to your colleagues on every device and in every tab; the tab id for a guest, who has no
   * account to be stable against.
   */
  colorSeed: string
  name: string
  role: PresenceRole
}

/** A peer as the canvas draws it. */
export interface Peer {
  id: string
  name: string
  color: string
  role: PresenceRole
  client: string
  /** Cursor in world coordinates, or null when off-canvas. */
  cursor: { x: number; y: number } | null
  /** Node the peer is on (hovering or dragging), or null. */
  nodeId: string | null
  ts: number
}

/** The identity half of a peer — what arrives on the roster, before any cursor traffic. */
export type PeerIdentity = PresenceIdentity & { client: string }

/** The volatile half — what arrives on the high-frequency channel. */
export interface PeerMotion {
  cursor: { x: number; y: number } | null
  nodeId: string | null
  ts: number
}

const COLORS = ['#e8590c', '#2f9e44', '#1971c2', '#9c36b5', '#c2255c', '#0c8599', '#e67700']

/**
 * djb2 rather than the old sum-of-char-codes, which collided on anagrams and on any two ids of
 * the same length drawn from the same alphabet — exactly what generated ids are. Two people in
 * the same colour is the one presentation bug that makes cursors actively misleading.
 */
export function colorFor(seed: string): string {
  let h = 5381
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

/**
 * The channel every participant on one brand agrees on, or null when there is nobody to agree
 * with. Null means presence stays off — the safe direction, because the failure it avoids is
 * broadcasting a name and a cursor into a room that other workspaces are also in.
 *
 * A share recipient reaches the same room by a different route: they have no workspace of their
 * own, so they pass the OWNER's workspace id, which their link already entitles them to look up.
 */
export function presenceRoomKey(input: { workspaceId: string | null; client: string }): string | null {
  const ws = (input.workspaceId ?? '').trim()
  const client = input.client.trim()
  if (!ws || !client || client === 'all') return null
  return `presence:${ws}:${client}`
}

/** A move is applied only from someone entitled to make one. See the note at the top of the file. */
export function canPublishMoves(role: PresenceRole): boolean {
  return role === 'editor'
}

/**
 * The roster and the cursor traffic arrive on different channels and at wildly different rates —
 * identity once on join, motion twenty times a second — so they are held apart and combined here.
 * A peer with no motion yet is still a peer: they are on the board, just not pointing at anything.
 */
export function mergePeers(input: {
  roster: PeerIdentity[]
  motion: Map<string, PeerMotion>
  client: string
  selfId: string
}): Peer[] {
  return input.roster
    .filter((p) => p.id !== input.selfId && p.client === input.client)
    .map((p) => {
      const m = input.motion.get(p.id)
      return {
        id: p.id,
        name: p.name,
        color: colorFor(p.colorSeed),
        role: p.role,
        client: p.client,
        cursor: m?.cursor ?? null,
        nodeId: m?.nodeId ?? null,
        ts: m?.ts ?? 0,
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * What a re-render would actually change on screen. Cursors move continuously and the roster
 * does not, so without this every heartbeat and every sub-pixel jitter re-rendered a canvas that
 * can hold hundreds of cards. Rounded to whole pixels because nothing finer is visible.
 */
export function peersSignature(peers: Peer[]): string {
  return peers
    .map(
      (p) =>
        `${p.id}:${p.name}:${p.role}:${p.color}:${
          p.cursor ? `${Math.round(p.cursor.x)},${Math.round(p.cursor.y)}` : '-'
        }:${p.nodeId ?? '-'}`,
    )
    .join('|')
}
