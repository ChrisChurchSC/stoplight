import { useEffect, useRef, useState } from 'react'
import {
  canPublishMoves,
  mergePeers,
  peersSignature,
  presenceRoomKey,
  type Peer,
  type PeerIdentity,
  type PeerMotion,
  type PresenceIdentity,
} from '../domain/livePresence'
import { resolvePresence } from './presenceIdentity'
import { supabase } from './supabase'

/**
 * Live cursors and presence for the canvas — over the network when there is one.
 *
 * This ran on a BroadcastChannel, which carries messages between tabs of the same browser on the
 * same machine and no further. Everything above the transport was real: cursors in WORLD
 * coordinates so they land on the same card however each person has panned and zoomed, per-node
 * "who is on this" badges, node drags applied last-write-wins. What was missing was anybody to
 * receive it. Two people on two laptops each saw an empty board and a pill reading "1 here".
 *
 * The wire is now a Supabase Realtime channel, split across the two rates the data actually moves
 * at. Identity goes on PRESENCE — once on join, again only when it changes — which also gives
 * joins, leaves and a full roster handed to each arrival for free, none of which a heartbeat can
 * do without either lag or chatter. Cursors go on BROADCAST at ~22/sec, carrying an id and two
 * numbers and nothing else, because repeating a name and a colour twenty times a second is twenty
 * times a second of somebody's bandwidth spent re-sending what has not changed.
 *
 * The BroadcastChannel path is kept for when Supabase is not configured, so a mock-mode or
 * offline dev build still demonstrates the feature rather than quietly showing nobody. Same
 * handlers, same merge, same rules — only the pipe differs.
 *
 * READ-ONLY PARTICIPANTS ARE REAL PARTICIPANTS. A ?share= recipient appears as a guest, which is
 * the point: you can see the client reading the campaign you sent them. They cannot move anything,
 * and that is enforced on both ends — see canPublishMoves and the note in domain/livePresence.
 */

export type { Peer } from '../domain/livePresence'

interface Opts {
  client: string
  /**
   * The campaign board this tab has open. The room is still the BRAND — a colleague elsewhere in
   * it should show up in the count — but each peer carries the board they are on, so the canvas
   * can draw only the ones actually looking at the same thing. See Peer.onBoard.
   */
  campaign: string
  enabled: boolean
  /** True in a ?share= view: join as a read-only guest, in the OWNER's room. */
  shared?: boolean
  bounds: { w: number; h: number }
  nodeIds: string[]
  /** Apply a peer's node drag locally (last-write-wins). */
  onRemoteMove: (id: string, x: number, y: number) => void
}

const CURSOR_THROTTLE_MS = 45
const LOCAL_CHANNEL = 'hyperfocus-presence-v1'
const LOCAL_HEARTBEAT_MS = 2000
const LOCAL_STALE_MS = 5000

/** What the hook needs from a pipe, so the two pipes stay interchangeable. */
interface Transport {
  sendMotion: (m: PeerMotion) => void
  sendMove: (id: string, x: number, y: number) => void
  close: () => void
}

interface Handlers {
  onRoster: (roster: PeerIdentity[]) => void
  onMotion: (from: string, m: PeerMotion) => void
  onMove: (from: string, id: string, x: number, y: number) => void
}

interface MotionMsg extends PeerMotion {
  from: string
}
interface MoveMsg {
  from: string
  id: string
  x: number
  y: number
}

/** Supabase Realtime: presence for the roster, broadcast for the motion. */
function openRealtime(room: string, self: PeerIdentity, h: Handlers): Transport {
  const client = supabase!
  const chan = client.channel(room, {
    // Keyed by tab so two windows of one account are two entries; `self: false` keeps our own
    // cursor off the wire's return trip, which would otherwise render a second cursor chasing
    // the real one about a frame behind.
    config: { presence: { key: self.id }, broadcast: { self: false } },
  })

  chan.on('presence', { event: 'sync' }, () => {
    const state = chan.presenceState() as unknown as Record<string, PeerIdentity[]>
    const roster: PeerIdentity[] = []
    for (const entries of Object.values(state)) for (const e of entries) if (e && e.id) roster.push(e)
    h.onRoster(roster)
  })
  chan.on('broadcast', { event: 'motion' }, ({ payload }) => {
    const m = payload as MotionMsg
    if (m?.from) h.onMotion(m.from, { cursor: m.cursor ?? null, nodeId: m.nodeId ?? null, ts: Date.now() })
  })
  chan.on('broadcast', { event: 'move' }, ({ payload }) => {
    const m = payload as MoveMsg
    if (m?.from) h.onMove(m.from, m.id, m.x, m.y)
  })

  void chan.subscribe((status) => {
    if (status === 'SUBSCRIBED') void chan.track(self)
  })

  return {
    sendMotion: (m) => {
      void chan.send({ type: 'broadcast', event: 'motion', payload: { from: self.id, ...m } })
    },
    sendMove: (id, x, y) => {
      void chan.send({ type: 'broadcast', event: 'move', payload: { from: self.id, id, x, y } })
    },
    close: () => {
      void chan.untrack()
      void client.removeChannel(chan)
    },
  }
}

/**
 * BroadcastChannel: no presence primitive, so the roster is rebuilt from heartbeats and pruned on
 * silence. Only reaches this browser — which is exactly why it is the fallback and no longer the
 * implementation.
 */
function openLocal(self: PeerIdentity, h: Handlers): Transport {
  const chan = new BroadcastChannel(LOCAL_CHANNEL)
  const seen = new Map<string, { peer: PeerIdentity; ts: number }>()

  const flush = () => {
    const now = Date.now()
    for (const [id, e] of seen) if (now - e.ts >= LOCAL_STALE_MS) seen.delete(id)
    h.onRoster([...seen.values()].map((e) => e.peer))
  }

  chan.onmessage = (e: MessageEvent) => {
    const m = e.data as { kind: string } & Record<string, unknown>
    if (m.kind === 'hello') {
      const peer = m.peer as PeerIdentity
      if (peer.id === self.id) return
      seen.set(peer.id, { peer, ts: Date.now() })
      flush()
    } else if (m.kind === 'bye') {
      seen.delete(m.id as string)
      flush()
    } else if (m.kind === 'motion') {
      const mm = m as unknown as MotionMsg
      if (mm.from === self.id) return
      const e2 = seen.get(mm.from)
      if (e2) e2.ts = Date.now()
      h.onMotion(mm.from, { cursor: mm.cursor ?? null, nodeId: mm.nodeId ?? null, ts: Date.now() })
    } else if (m.kind === 'move') {
      const mm = m as unknown as MoveMsg
      if (mm.from === self.id) return
      h.onMove(mm.from, mm.id, mm.x, mm.y)
    }
  }

  const hello = () => chan.postMessage({ kind: 'hello', peer: self })
  hello()
  const hb = setInterval(() => {
    hello()
    flush()
  }, LOCAL_HEARTBEAT_MS)
  const bye = () => chan.postMessage({ kind: 'bye', id: self.id })
  window.addEventListener('beforeunload', bye)

  return {
    sendMotion: (m) => chan.postMessage({ kind: 'motion', from: self.id, ...m }),
    sendMove: (id, x, y) => chan.postMessage({ kind: 'move', from: self.id, id, x, y }),
    close: () => {
      bye()
      clearInterval(hb)
      window.removeEventListener('beforeunload', bye)
      chan.close()
    },
  }
}

export function usePresence(opts: Opts): {
  peers: Peer[]
  publishCursor: (x: number, y: number) => void
  publishNode: (nodeId: string | null) => void
  publishMove: (id: string, x: number, y: number) => void
  clearCursor: () => void
} {
  const { client, campaign, enabled, shared = false, onRemoteMove } = opts
  const [peers, setPeers] = useState<Peer[]>([])

  const selfRef = useRef<PresenceIdentity | null>(null)
  const transportRef = useRef<Transport | null>(null)
  const rosterRef = useRef<PeerIdentity[]>([])
  const motionRef = useRef<Map<string, PeerMotion>>(new Map())
  const sigRef = useRef('')
  const lastSent = useRef(0)
  const cursorRef = useRef<{ x: number; y: number } | null>(null)
  const nodeRef = useRef<string | null>(null)
  const onMoveRef = useRef(onRemoteMove)
  onMoveRef.current = onRemoteMove

  useEffect(() => {
    if (!enabled) {
      rosterRef.current = []
      motionRef.current.clear()
      sigRef.current = ''
      setPeers([])
      return
    }

    let cancelled = false
    let close = () => {}

    const recompute = () => {
      const self = selfRef.current
      if (!self) return
      const next = mergePeers({
        roster: rosterRef.current,
        motion: motionRef.current,
        client,
        campaign,
        selfId: self.id,
      })
      const sig = peersSignature(next)
      if (sig === sigRef.current) return
      sigRef.current = sig
      setPeers(next)
    }

    const handlers: Handlers = {
      onRoster: (roster) => {
        rosterRef.current = roster
        // Motion outlives nobody: drop what belongs to peers who have left, or the map grows for
        // as long as the tab is open.
        const live = new Set(roster.map((p) => p.id))
        for (const id of motionRef.current.keys()) if (!live.has(id)) motionRef.current.delete(id)
        recompute()
      },
      onMotion: (from, m) => {
        motionRef.current.set(from, m)
        recompute()
      },
      onMove: (from, id, x, y) => {
        // Refused at the receiving end too. A broadcast payload is whatever its sender chose to
        // put in it, so "viewers do not send moves" is worth nothing without this line.
        const sender = rosterRef.current.find((p) => p.id === from)
        if (!sender || !canPublishMoves(sender.role)) return
        onMoveRef.current(id, x, y)
      },
    }

    void (async () => {
      const { identity, workspaceId } = await resolvePresence({ shared })
      if (cancelled) return
      selfRef.current = identity
      const room = presenceRoomKey({ workspaceId, client })
      const self: PeerIdentity = { ...identity, client, campaign }
      const t =
        room && supabase
          ? openRealtime(room, self, handlers)
          : typeof BroadcastChannel !== 'undefined'
            ? openLocal(self, handlers)
            : null
      if (!t) return
      transportRef.current = t
      close = () => {
        t.close()
        transportRef.current = null
      }
    })()

    return () => {
      cancelled = true
      close()
      rosterRef.current = []
      motionRef.current.clear()
      sigRef.current = ''
    }
  }, [enabled, client, campaign, shared])

  const sendMotion = (force: boolean) => {
    const t = transportRef.current
    if (!t) return
    const now = Date.now()
    if (!force && now - lastSent.current < CURSOR_THROTTLE_MS) return
    lastSent.current = now
    t.sendMotion({ cursor: cursorRef.current, nodeId: nodeRef.current, ts: now })
  }

  const publishCursor = (x: number, y: number) => {
    cursorRef.current = { x, y }
    sendMotion(false)
  }
  const clearCursor = () => {
    cursorRef.current = null
    sendMotion(true)
  }
  const publishNode = (nodeId: string | null) => {
    if (nodeRef.current === nodeId) return
    nodeRef.current = nodeId
    sendMotion(true)
  }
  const publishMove = (id: string, x: number, y: number) => {
    const self = selfRef.current
    if (!self || !canPublishMoves(self.role)) return
    transportRef.current?.sendMove(id, x, y)
  }

  return { peers, publishCursor, publishNode, publishMove, clearCursor }
}
