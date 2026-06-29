import { useEffect, useRef, useState } from 'react'

/**
 * Backend-free multiplayer for the canvas. Tabs/windows of the same browser sync
 * presence and live cursors over a BroadcastChannel; cursors travel in WORLD
 * coordinates so they land over the same nodes no matter how each viewport is
 * panned or zoomed. When a tab is alone, an ambient teammate drifts around so the
 * canvas still feels inhabited. Node drags ride the same channel and apply
 * last-write-wins (a move message overwrites the local nudge).
 */

export interface Peer {
  id: string
  name: string
  color: string
  role: string
  client: string
  /** Cursor in world coordinates, or null when off-canvas. */
  cursor: { x: number; y: number } | null
  /** Node the peer is on (hovering or dragging), or null. */
  nodeId: string | null
  ambient?: boolean
  ts: number
}

interface Opts {
  client: string
  enabled: boolean
  bounds: { w: number; h: number }
  nodeIds: string[]
  /** Apply a peer's node drag locally (last-write-wins). */
  onRemoteMove: (id: string, x: number, y: number) => void
}

const CHANNEL = 'rushhour-presence-v1'
const HEARTBEAT_MS = 2000
const STALE_MS = 5000
const CURSOR_THROTTLE_MS = 45

const NAMES = ['Dana Reyes', 'Sam Ito', 'Priya Shah', 'Marco Diaz', 'Lee Park', 'Ana Costa', 'Tom Vance']
const COLORS = ['#e8590c', '#2f9e44', '#1971c2', '#9c36b5', '#c2255c', '#0c8599', '#e67700']

const hash = (s: string): number => [...s].reduce((a, c) => a + c.charCodeAt(0), 0)

interface SelfMsg {
  kind: 'state' | 'leave'
  peer: Peer
}
interface MoveMsg {
  kind: 'move'
  from: string
  client: string
  id: string
  x: number
  y: number
}
type Msg = SelfMsg | MoveMsg

/** Stable per-tab identity (kept across reloads within the tab). */
function loadIdentity(role: string): { id: string; name: string; color: string } {
  const KEY = 'stoplight.presence.identity'
  try {
    const saved = sessionStorage.getItem(KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    /* ignore */
  }
  const id = `peer_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
  const h = hash(id)
  const ident = { id, name: NAMES[h % NAMES.length], color: COLORS[h % COLORS.length] }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ident))
  } catch {
    /* ignore */
  }
  void role
  return ident
}

export function usePresence(opts: Opts): {
  peers: Peer[]
  publishCursor: (x: number, y: number) => void
  publishNode: (nodeId: string | null) => void
  publishMove: (id: string, x: number, y: number) => void
  clearCursor: () => void
} {
  const { client, enabled, onRemoteMove } = opts
  const [peers, setPeers] = useState<Peer[]>([])

  const selfRef = useRef<Peer | null>(null)
  const chanRef = useRef<BroadcastChannel | null>(null)
  const remotesRef = useRef<Map<string, Peer>>(new Map())
  // Count of live peers on the current client — drives the ambient "am I alone?"
  // check off the pruned, client-scoped set (not the raw map).
  const liveCountRef = useRef(0)
  const peersSig = useRef('')
  const lastCursorSent = useRef(0)
  const onMoveRef = useRef(onRemoteMove)
  onMoveRef.current = onRemoteMove
  // Keep the ambient drift reading fresh scope without re-subscribing.
  const boundsRef = useRef(opts.bounds)
  boundsRef.current = opts.bounds
  const nodeIdsRef = useRef(opts.nodeIds)
  nodeIdsRef.current = opts.nodeIds

  // Identity is stable for the tab; role can change (e.g. entering a share).
  if (!selfRef.current) {
    const ident = loadIdentity('')
    selfRef.current = { ...ident, role: 'owner', client, cursor: null, nodeId: null, ts: Date.now() }
  }

  // ---- transport ----
  useEffect(() => {
    if (!enabled || typeof BroadcastChannel === 'undefined') {
      remotesRef.current.clear()
      setPeers([])
      return
    }
    selfRef.current!.client = client
    const chan = new BroadcastChannel(CHANNEL)
    chanRef.current = chan

    const recompute = () => {
      const now = Date.now()
      // Actually delete stale peers so the map can't grow unbounded and the
      // ambient "alone?" check stays accurate after an unclean leave.
      for (const [id, p] of remotesRef.current) {
        if (now - p.ts >= STALE_MS) remotesRef.current.delete(id)
      }
      const live = [...remotesRef.current.values()].filter((p) => p.client === client)
      liveCountRef.current = live.length
      // Skip the re-render when nothing visible changed (e.g. a bare heartbeat).
      const sig = live
        .map((p) => `${p.id}:${p.cursor ? `${Math.round(p.cursor.x)},${Math.round(p.cursor.y)}` : '-'}:${p.nodeId ?? '-'}`)
        .join('|')
      if (sig === peersSig.current) return
      peersSig.current = sig
      setPeers(live)
    }

    chan.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data
      if (m.kind === 'state') {
        if (m.peer.id === selfRef.current!.id) return
        remotesRef.current.set(m.peer.id, { ...m.peer, ts: Date.now() })
        recompute()
      } else if (m.kind === 'leave') {
        remotesRef.current.delete(m.peer.id)
        recompute()
      } else if (m.kind === 'move') {
        if (m.from === selfRef.current!.id || m.client !== client) return
        onMoveRef.current(m.id, m.x, m.y)
      }
    }

    const announce = () => {
      selfRef.current!.ts = Date.now()
      chan.postMessage({ kind: 'state', peer: selfRef.current! } satisfies SelfMsg)
    }
    announce()
    const hb = setInterval(() => {
      announce()
      recompute() // prune stale peers too
    }, HEARTBEAT_MS)

    const onUnload = () => chan.postMessage({ kind: 'leave', peer: selfRef.current! } satisfies SelfMsg)
    window.addEventListener('beforeunload', onUnload)

    return () => {
      onUnload()
      clearInterval(hb)
      window.removeEventListener('beforeunload', onUnload)
      chan.close()
      chanRef.current = null
      remotesRef.current.clear()
    }
  }, [enabled, client])

  // ---- ambient teammate when alone ----
  // The ambient "Dana Reyes" teammate is turned off for now — no ghost cursor.
  const [ambient] = useState<Peer | null>(null)

  const publishCursor = (x: number, y: number) => {
    const self = selfRef.current
    if (!self || !chanRef.current) return
    self.cursor = { x, y }
    const now = Date.now()
    if (now - lastCursorSent.current < CURSOR_THROTTLE_MS) return
    lastCursorSent.current = now
    self.ts = now
    chanRef.current.postMessage({ kind: 'state', peer: self } satisfies SelfMsg)
  }
  const clearCursor = () => {
    const self = selfRef.current
    if (!self || !chanRef.current) return
    self.cursor = null
    self.ts = Date.now()
    chanRef.current.postMessage({ kind: 'state', peer: self } satisfies SelfMsg)
  }
  const publishNode = (nodeId: string | null) => {
    const self = selfRef.current
    if (!self || !chanRef.current) return
    if (self.nodeId === nodeId) return
    self.nodeId = nodeId
    self.ts = Date.now()
    chanRef.current.postMessage({ kind: 'state', peer: self } satisfies SelfMsg)
  }
  const publishMove = (id: string, x: number, y: number) => {
    const self = selfRef.current
    if (!self || !chanRef.current) return
    chanRef.current.postMessage({ kind: 'move', from: self.id, client, id, x, y } satisfies MoveMsg)
  }

  const all = ambient && peers.length === 0 ? [ambient, ...peers] : peers
  return { peers: all, publishCursor, publishNode, publishMove, clearCursor }
}
