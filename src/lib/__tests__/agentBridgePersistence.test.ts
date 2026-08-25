// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAgentAction } from '../agentBridge'

/**
 * THE BUG THIS EXISTS FOR: the connector said "added" about work that was never stored.
 *
 * Every write in agentBridge updates the store and answers out of memory, so a card or a row that
 * never reached localStorage still came back as a clean result with an id on it. In the app that is
 * survivable — a canvas is on screen and the next reload shows the truth to somebody who was
 * looking. Through Claude Desktop nobody is looking. A session built a brand out to twenty-two
 * object cards and twenty-six assets, was told each one landed, and lost every one of them on
 * reload, three times in a row, while the brand-level library (small enough to fit) survived
 * intact. The transcript still said it was there.
 *
 * These drive the two paths against a browser that will not keep the write, and assert the thing
 * that was false before: the connector reports the failure instead of a result.
 */

/** Let reads through, refuse every write — the shape of a full localStorage. */
function refuseWrites(): void {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError')
  })
}

/**
 * The store is a module singleton, so it carries memory from one test into the next while
 * localStorage.clear() wipes only the other half. Rather than reach in and reset it, each test
 * works on a board of its own — closer to how the connector is actually used, and it keeps the
 * assertions about what a reload would find rather than about test bookkeeping.
 */
let boardNo = 0
const freshBoard = () => `Campaign ${++boardNo}`

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a board written before the workspace has loaded', () => {
  /**
   * THE ONE THAT ACTUALLY HAPPENED, and the one the first version of this check could not see.
   *
   * saveFlowBoard withholds the write while `boardsHydrated` is false — correctly, since it
   * persists every board under one key and an early write would push this tab's stale copy over
   * the workspace's. The in-memory slice is still updated, so the card is in the store,
   * list_object_cards confirms it, and nothing was written. Signed in, that flag starts false, so
   * it is the OPENING of a session that silently drops work — exactly where a connector does its
   * setting up. A deployed session added 22 cards to a campaign and 2 survived.
   */
  it('refuses rather than reporting a card the store is about to drop', async () => {
    const { useTrafficStore } = await import('../../store/useTrafficStore')
    const was = useTrafficStore.getState().boardsHydrated
    useTrafficStore.setState({ boardsHydrated: false })
    try {
      const res = await runAgentAction('addObjectCard', { campaign: freshBoard(), kind: 'audience', name: 'The Trade' })
      expect(res.result).toBeUndefined()
      expect(res.error).toMatch(/not finished loading|try again/i)
    } finally {
      useTrafficStore.setState({ boardsHydrated: was })
    }
  })

  it('lets the same write through once the workspace has landed', async () => {
    const { useTrafficStore } = await import('../../store/useTrafficStore')
    useTrafficStore.setState({ boardsHydrated: true })
    const res = await runAgentAction('addObjectCard', { campaign: freshBoard(), kind: 'audience', name: 'The Trade' })
    expect(res.error).toBeUndefined()
  })
})

describe('an object card the browser could not store', () => {
  it('is reported as an error, not as a card with an id', async () => {
    const campaign = freshBoard()
    const ok = await runAgentAction('addObjectCard', { campaign, kind: 'audience', name: 'The Trade' })
    expect(ok.error, 'the healthy write should succeed first').toBeUndefined()

    refuseWrites()
    const failed = await runAgentAction('addObjectCard', { campaign, kind: 'audience', name: 'The Aesthete' })
    expect(failed.result).toBeUndefined()
    expect(failed.error).toMatch(/could not store|storage is full/i)
  })

  it('does not leave the phantom card behind for the rest of the session to build on', async () => {
    const campaign = freshBoard()
    await runAgentAction('addObjectCard', { campaign, kind: 'audience', name: 'The Trade' })
    refuseWrites()
    await runAgentAction('addObjectCard', { campaign, kind: 'message', name: 'Bought Once, Not Twice' })
    vi.restoreAllMocks()

    // Reading the board back must agree with what storage will actually have after a reload.
    const read = (await runAgentAction('listObjectCards', { campaign })) as {
      result: { cards: { name?: string }[] }
    }
    expect(read.result.cards.map((c) => c.name)).toEqual(['The Trade'])
  })
})

describe('an asset the browser could not store', () => {
  it('is reported as an error rather than a draft that is not there', async () => {
    refuseWrites()
    const failed = await runAgentAction('addAsset', {
      brand: 'Enid Blythe',
      campaign: 'Always-On',
      channel: 'instagram',
      // primaryText, not headline: an Instagram post renders no headline, and add_asset now refuses
      // a write it cannot store rather than noting it afterwards — which would fail this for the
      // wrong reason. That the fixture ever passed `headline` is what the old silent note hid.
      primaryText: 'The last unspecified object',
    })
    expect(failed.result).toBeUndefined()
    expect(failed.error).toMatch(/could not store|storage is full/i)
  })
})
