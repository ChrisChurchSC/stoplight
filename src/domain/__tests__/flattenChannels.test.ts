import { describe, expect, it } from 'vitest'
import { flattenChannelNodes, type FlowBoard } from '../flowBoard'

/**
 * REMOVING THE CHANNEL MUST NOT REMOVE THE WORK FILED UNDER IT.
 *
 * The channel card is derived, so deleting it looks free. It is not: a wire drawn to it, a decision
 * to cut it off from the brief, and wherever somebody dragged it are all keyed to it, and pruneBoard
 * deletes any endpoint that stops existing. Silently. These tests are the difference between a
 * cleaner board and a board that quietly lost the lines explaining why its copy says what it says.
 */
const board = (over: Partial<FlowBoard> = {}): FlowBoard => ({
  key: 'Acme|Launch',
  objects: [],
  placements: [],
  pos: {},
  connectors: [],
  ...over,
})

const CHANNELS = new Map([
  ['linkedin|post', ['row_a', 'row_b']],
  ['email|newsletter', ['row_c']],
])

describe('flattenChannelNodes', () => {
  it('turns a wire into the channel into a wire into each of its assets', () => {
    const out = flattenChannelNodes(
      board({ connectors: [{ from: 'audience_1', to: 'linkedin|post' }] }),
      CHANNELS,
    )
    expect(out.connectors).toEqual([
      { from: 'audience_1', to: 'row_a' },
      { from: 'audience_1', to: 'row_b' },
    ])
  })

  it('does the same for a wire OUT of a channel', () => {
    const out = flattenChannelNodes(
      board({ connectors: [{ from: 'email|newsletter', to: 'row_z' }] }),
      CHANNELS,
    )
    expect(out.connectors).toEqual([{ from: 'row_c', to: 'row_z' }])
  })

  it('leaves wires between two ordinary cards exactly as they were', () => {
    const conns = [{ from: 'campaign', to: 'row_a' }, { from: 'obj_1', to: 'obj_2' }]
    expect(flattenChannelNodes(board({ connectors: conns }), CHANNELS).connectors).toEqual(conns)
  })

  it('does not leave a card wired to itself when both ends resolve to it', () => {
    // A channel wired to one of its own assets is a real thing to have drawn, and it collapses.
    const out = flattenChannelNodes(
      board({ connectors: [{ from: 'linkedin|post', to: 'row_a' }] }),
      CHANNELS,
    )
    expect(out.connectors).toEqual([{ from: 'row_b', to: 'row_a' }])
  })

  it('does not draw the same wire twice when two channels share an asset', () => {
    const shared = new Map([['a|x', ['row_a']], ['b|y', ['row_a']]])
    const out = flattenChannelNodes(
      board({ connectors: [{ from: 'campaign', to: 'a|x' }, { from: 'campaign', to: 'b|y' }] }),
      shared,
    )
    expect(out.connectors).toEqual([{ from: 'campaign', to: 'row_a' }])
  })

  it('drops a wire to a channel that has no assets left, rather than keeping a dead endpoint', () => {
    const out = flattenChannelNodes(
      board({ connectors: [{ from: 'campaign', to: 'gone|channel' }] }),
      CHANNELS,
    )
    expect(out.connectors).toEqual([])
  })

  it('moves detached-from-brief onto the assets, so they keep the inheritance they had', () => {
    const out = flattenChannelNodes(board({ detached: ['linkedin|post'] }), CHANNELS)
    expect(out.detached).toEqual(['row_a', 'row_b'])
  })

  it('leaves a board that never detached anything without the field', () => {
    expect(flattenChannelNodes(board(), CHANNELS).detached).toBeUndefined()
  })

  it('forgets where a channel was dragged and keeps where everything else was', () => {
    const out = flattenChannelNodes(
      board({ pos: { 'linkedin|post': { x: 1, y: 2 }, row_a: { x: 3, y: 4 }, campaign: { x: 5, y: 6 } } }),
      CHANNELS,
    )
    expect(out.pos).toEqual({ row_a: { x: 3, y: 4 }, campaign: { x: 5, y: 6 } })
  })

  it('keeps everything else on the board untouched', () => {
    const b = board({ objects: [{ id: 'o1', kind: 'audience' }] as FlowBoard['objects'], key: 'Acme|Launch' })
    const out = flattenChannelNodes(b, CHANNELS)
    expect(out.key).toBe('Acme|Launch')
    expect(out.objects).toEqual(b.objects)
  })
})
