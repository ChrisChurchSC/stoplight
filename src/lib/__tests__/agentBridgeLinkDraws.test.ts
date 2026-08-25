// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { runAgentAction } from '../agentBridge'

/**
 * A LINK THE MODEL KNOWS ABOUT AND THE BOARD DOES NOT SHOW.
 *
 * link_assets writes linksTo and branchOf, and that is what every check reads: handoffsFrom, the CTA
 * requirements, the coherence pass, review_campaign. What none of them do is put a line on the
 * board, and nothing on the canvas derives one - linksTo appears nowhere in FlowsView. So a campaign
 * linked through the MCP came out looking exactly like a campaign nobody had linked. The route was
 * real, and invisible to the person looking at it.
 *
 * These assert the two halves stay together: the link writes the field AND draws the connector, and
 * unlinking takes both away again.
 */
let n = 0
const fresh = () => `Journey campaign ${++n}`

const seed = async (campaign: string, brand: string, name: string) => {
  const res = await runAgentAction('addAsset', {
    brand,
    campaign,
    channel: 'linkedin',
    // LinkedIn's only copy field is the body; a headline would be refused outright.
    body: name,
    assetName: name,
  })
  expect(res.error).toBeUndefined()
  return res
}

const boardFor = async (campaign: string) => {
  const { useTrafficStore } = await import('../../store/useTrafficStore')
  return useTrafficStore.getState().flowBoards.find((b) => b.key === campaign)
}

beforeEach(async () => {
  const { useTrafficStore } = await import('../../store/useTrafficStore')
  useTrafficStore.setState({ boardsHydrated: true })
})

describe('link_assets draws the line it stands for', () => {
  it('adds a connector between the two assets, not just the field', async () => {
    const campaign = fresh()
    const brand = 'Acme'
    await seed(campaign, brand, 'First step')
    await seed(campaign, brand, 'Second step')

    const res = await runAgentAction('linkAssets', { from: 'First step', to: 'Second step' })
    expect(res.error).toBeUndefined()

    const { useTrafficStore } = await import('../../store/useTrafficStore')
    const rows = useTrafficStore.getState().rows.filter((r) => r.campaign === campaign)
    const from = rows.find((r) => r.assetName === 'First step')!
    const to = rows.find((r) => r.assetName === 'Second step')!

    // The meaning, as before.
    expect(from.linksTo).toBe('Second step')
    // And the line, which is what was missing.
    const board = await boardFor(campaign)
    expect(board?.connectors.some((c) => c.from === from.id && c.to === to.id)).toBe(true)
  })

  it('draws one for a branch too', async () => {
    const campaign = fresh()
    const brand = 'Acme'
    await seed(campaign, brand, 'Parent step')
    await seed(campaign, brand, 'Branch step')

    await runAgentAction('linkAssets', { from: 'Parent step', to: 'Branch step', as: 'branch' })

    const { useTrafficStore } = await import('../../store/useTrafficStore')
    const rows = useTrafficStore.getState().rows.filter((r) => r.campaign === campaign)
    const from = rows.find((r) => r.assetName === 'Parent step')!
    const to = rows.find((r) => r.assetName === 'Branch step')!
    expect(to.branchOf).toBe('Parent step')
    const board = await boardFor(campaign)
    expect(board?.connectors.some((c) => c.from === from.id && c.to === to.id)).toBe(true)
  })

  it('takes the line away again when the link is undone', async () => {
    const campaign = fresh()
    const brand = 'Acme'
    await seed(campaign, brand, 'Lead in')
    await seed(campaign, brand, 'Lead out')
    await runAgentAction('linkAssets', { from: 'Lead in', to: 'Lead out' })

    const { useTrafficStore } = await import('../../store/useTrafficStore')
    const rows = useTrafficStore.getState().rows.filter((r) => r.campaign === campaign)
    const from = rows.find((r) => r.assetName === 'Lead in')!
    const to = rows.find((r) => r.assetName === 'Lead out')!
    expect((await boardFor(campaign))?.connectors.some((c) => c.from === from.id && c.to === to.id)).toBe(true)

    const un = await runAgentAction('unlinkAssets', { from: 'Lead in', to: 'Lead out' })
    expect(un.error).toBeUndefined()

    // A line left behind would claim a journey the model no longer has. Board GONE counts as no
    // line: saveFlowBoard treats a board with nothing on it as a removal rather than a blank row,
    // so taking the last connector off takes the row with it.
    const after = await boardFor(campaign)
    expect(Boolean(after?.connectors.some((c) => c.from === from.id && c.to === to.id))).toBe(false)
  })
})
