import { describe, expect, it } from 'vitest'
import { hasAssignedBudget, needsMediaBudget } from '../budget'
import type { ChannelId, TrafficRow } from '../types'

/**
 * A PAID PLACEMENT WITH NO BUDGET IS NOT A FUNDED ONE.
 *
 * The flow canvas tints a connector gold to say money is on that path. It was deciding that from
 * the CHANNEL being paid, which is a different question: a Google search ad sitting at $0 read as
 * funded, identical to one carrying a real budget, when it is the one asset on the board that
 * cannot run at all. This predicate is the distinction that colour now keys off.
 *
 * The organic case is pinned as hard as the paid one. A blog post has no budget and never needed
 * one, so flagging it would mean every card on an organic campaign shouting about missing money —
 * a signal that fires everywhere is not a signal.
 */

const row = (channel: string, over: Partial<TrafficRow> = {}): TrafficRow =>
  ({
    id: 'row_1',
    assetId: 'a1',
    assetName: 'Asset',
    mediaType: 'text',
    channel: channel as ChannelId,
    messaging: {},
    scheduledAt: '2026-03-10',
    status: 'draft',
    ...over,
  }) as TrafficRow

describe('needsMediaBudget', () => {
  it('flags a paid placement with nothing assigned to it', () => {
    expect(needsMediaBudget(row('google-search'))).toBe(true)
    expect(needsMediaBudget(row('meta-ads'))).toBe(true)
  })

  it('clears once a budget is assigned', () => {
    expect(needsMediaBudget(row('google-search', { budget: { amount: 2500, type: 'lifetime' } }))).toBe(false)
  })

  it('clears on logged spend, with no budget field at all', () => {
    // Spend proves money reached this placement whatever the plan says; a live ad reporting spend
    // is not waiting on a budget to be set.
    expect(needsMediaBudget(row('google-search', { spend: { toDate: 812, updatedAt: 0 } }))).toBe(false)
  })

  it('treats a zero budget as no budget', () => {
    // The field exists and says nothing is allocated. That is the state, not an exception to it.
    expect(needsMediaBudget(row('google-search', { budget: { amount: 0, type: 'daily' } }))).toBe(true)
  })

  it('never flags an organic asset — it has no budget to be missing', () => {
    expect(needsMediaBudget(row('blog'))).toBe(false)
    expect(needsMediaBudget(row('blog', { budget: { amount: 0, type: 'lifetime' } }))).toBe(false)
  })

  it('never flags a channel the catalog does not know, rather than throwing on it', () => {
    // Imported and hand-typed rows carry ids the catalog has never seen. An unknown channel is not
    // a paid one, and reading .kind off undefined would take the whole canvas down with it.
    expect(() => needsMediaBudget(row('some-imported-thing'))).not.toThrow()
    expect(needsMediaBudget(row('some-imported-thing'))).toBe(false)
  })
})

describe('hasAssignedBudget', () => {
  it('is money on the asset, not money near it', () => {
    expect(hasAssignedBudget(row('google-search'))).toBe(false)
    expect(hasAssignedBudget(row('google-search', { budget: { amount: 1, type: 'daily' } }))).toBe(true)
    expect(hasAssignedBudget(row('google-search', { spend: { toDate: 1, updatedAt: 0 } }))).toBe(true)
  })
})
