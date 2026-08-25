import { describe, expect, it } from 'vitest'
import {
  canPublishMoves,
  colorFor,
  mergePeers,
  peersSignature,
  presenceRoomKey,
  type PeerIdentity,
  type PeerMotion,
} from '../livePresence'

const ident = (over: Partial<PeerIdentity> = {}): PeerIdentity => ({
  id: 'tab_a',
  colorSeed: 'user_a',
  name: 'Ari',
  role: 'editor',
  client: 'ABM',
  ...over,
})

describe('presenceRoomKey', () => {
  it('puts the workspace in front of the brand, so the room cannot be guessed from the brand name', () => {
    const room = presenceRoomKey({ workspaceId: '97ffd48c-4093-4b10-9e85-8f681074f2b7', client: 'ABM' })
    expect(room).toBe('presence:97ffd48c-4093-4b10-9e85-8f681074f2b7:ABM')
  })

  it('is off rather than global when there is no workspace to scope it to', () => {
    expect(presenceRoomKey({ workspaceId: null, client: 'ABM' })).toBeNull()
    expect(presenceRoomKey({ workspaceId: '   ', client: 'ABM' })).toBeNull()
  })

  it('is off outside a brand — "all" is a view, not a room', () => {
    expect(presenceRoomKey({ workspaceId: 'ws', client: 'all' })).toBeNull()
    expect(presenceRoomKey({ workspaceId: 'ws', client: '' })).toBeNull()
  })
})

describe('colorFor', () => {
  it('gives one seed the same colour every time, so you are one colour to your colleagues', () => {
    expect(colorFor('user_a')).toBe(colorFor('user_a'))
  })

  it('separates ids the old sum-of-char-codes hash collided on', () => {
    // Every one of these pairs came out the same colour under the previous hash, which summed
    // char codes and so could not tell an id from its own anagram — and generated ids are exactly
    // that: same length, same alphabet. Two people in one colour makes cursors actively misleading.
    for (const [a, b] of [
      ['tab_ab', 'tab_ba'],
      ['peer_12', 'peer_21'],
      ['ab', 'ba'],
    ]) {
      expect(colorFor(a)).not.toBe(colorFor(b))
    }
  })
})

describe('canPublishMoves', () => {
  it('lets an editor move cards and refuses a viewer', () => {
    expect(canPublishMoves('editor')).toBe(true)
    expect(canPublishMoves('viewer')).toBe(false)
  })
})

describe('mergePeers', () => {
  const motion = (over: Partial<PeerMotion> = {}): PeerMotion => ({
    cursor: { x: 10, y: 20 },
    nodeId: null,
    ts: 1,
    ...over,
  })

  it('leaves yourself out — a cursor chasing your own is a bug, not a teammate', () => {
    const peers = mergePeers({
      roster: [ident({ id: 'tab_a' }), ident({ id: 'tab_b', name: 'Sam' })],
      motion: new Map(),
      client: 'ABM',
      selfId: 'tab_a',
    })
    expect(peers.map((p) => p.name)).toEqual(['Sam'])
  })

  it('keeps a peer who has not moved yet — being on the board is not the same as pointing at something', () => {
    const peers = mergePeers({
      roster: [ident({ id: 'tab_b', name: 'Sam' })],
      motion: new Map(),
      client: 'ABM',
      selfId: 'tab_a',
    })
    expect(peers).toHaveLength(1)
    expect(peers[0].cursor).toBeNull()
    expect(peers[0].nodeId).toBeNull()
  })

  it('lays the motion channel over the roster entry it belongs to', () => {
    const peers = mergePeers({
      roster: [ident({ id: 'tab_b', name: 'Sam' })],
      motion: new Map([['tab_b', motion({ cursor: { x: 4, y: 5 }, nodeId: 'node_9' })]]),
      client: 'ABM',
      selfId: 'tab_a',
    })
    expect(peers[0].cursor).toEqual({ x: 4, y: 5 })
    expect(peers[0].nodeId).toBe('node_9')
  })

  it('does not show somebody working on another brand', () => {
    const peers = mergePeers({
      roster: [ident({ id: 'tab_b', name: 'Sam', client: 'Gretel' })],
      motion: new Map(),
      client: 'ABM',
      selfId: 'tab_a',
    })
    expect(peers).toEqual([])
  })

  it('carries the role through, so a share guest can be drawn as one', () => {
    const peers = mergePeers({
      roster: [ident({ id: 'tab_g', name: 'Guest', role: 'viewer' })],
      motion: new Map(),
      client: 'ABM',
      selfId: 'tab_a',
    })
    expect(peers[0].role).toBe('viewer')
  })
})

describe('peersSignature', () => {
  const peer = (over: Partial<ReturnType<typeof mergePeers>[number]> = {}) => ({
    id: 'tab_b',
    name: 'Sam',
    color: '#1971c2',
    role: 'editor' as const,
    client: 'ABM',
    cursor: { x: 10.1, y: 20.2 },
    nodeId: null,
    ts: 1,
    ...over,
  })

  it('ignores movement too small to see, so the canvas is not re-rendered for nothing', () => {
    expect(peersSignature([peer({ cursor: { x: 10.1, y: 20.2 } })])).toBe(
      peersSignature([peer({ cursor: { x: 10.4, y: 19.8 } })]),
    )
  })

  it('changes when a peer actually moves', () => {
    expect(peersSignature([peer({ cursor: { x: 10, y: 20 } })])).not.toBe(
      peersSignature([peer({ cursor: { x: 40, y: 20 } })]),
    )
  })

  it('changes when who is here changes', () => {
    expect(peersSignature([peer({ name: 'Sam' })])).not.toBe(peersSignature([peer({ name: 'Ari' })]))
    expect(peersSignature([peer({ role: 'editor' })])).not.toBe(peersSignature([peer({ role: 'viewer' })]))
    expect(peersSignature([peer()])).not.toBe(peersSignature([]))
  })
})
