// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { runAgentAction } from '../agentBridge'

/**
 * THE FAILURE THIS EXISTS FOR: a session told somebody their campaign did not exist.
 *
 * Asked about a file called "ABM FW 2026", it called list_clients — the only listing there was —
 * did not find the name among the brands, and concluded the connector and the app were talking to
 * two different databases. It then offered to rebuild the work somewhere else. The campaign was
 * there the whole time with its eight assets, in the Drafts space, which belongs to no brand and
 * which clientList excludes on purpose.
 *
 * Nothing was broken. The tool surface simply had no way to ask "what campaigns are there", so
 * absence of evidence looked exactly like evidence of absence.
 */

let n = 0
const fresh = () => `Campaign ${++n}`

beforeEach(() => {
  localStorage.clear()
})

describe('finding a campaign by name', () => {
  it('lists a campaign that belongs to a brand, with its brand and asset count', async () => {
    const campaign = fresh()
    await runAgentAction('addAsset', { brand: 'Enid Blythe', campaign, channel: 'linkedin', assetName: `${campaign} post` })

    const res = (await runAgentAction('listCampaigns', {})) as {
      result: { campaigns: { name: string; brand: string; assets: number; unowned: boolean }[] }
    }
    const found = res.result.campaigns.find((c) => c.name === campaign)!
    expect(found.brand).toBe('Enid Blythe')
    expect(found.assets).toBe(1)
    expect(found.unowned).toBe(false)
  })

  it('lists a campaign that belongs to NO brand, which is the one nothing else could show', async () => {
    const { useTrafficStore } = await import('../../store/useTrafficStore')
    const campaign = fresh()
    // What the app's own New Canvas makes: a campaign in the Drafts space.
    useTrafficStore.getState().addCampaign({ name: campaign, client: 'Drafts', strategy: 'Demand Gen' })

    const res = (await runAgentAction('listCampaigns', {})) as {
      result: { campaigns: { name: string; brand: string; unowned: boolean }[]; note: string }
    }
    const found = res.result.campaigns.find((c) => c.name === campaign)!
    expect(found.brand).toBe('Drafts')
    expect(found.unowned).toBe(true)
    // And it says out loud why nothing else showed it.
    expect(res.result.note).toMatch(/Drafts/)

    // The listing that misled: brands only, and Drafts is not one of them.
    const brands = (await runAgentAction('listClients', {})) as { result: { clients: string[]; note: string } }
    expect(brands.result.clients).not.toContain('Drafts')
    expect(brands.result.note).toMatch(/list_campaigns/)
  })

  it('scopes to one brand when asked, Drafts included', async () => {
    const { useTrafficStore } = await import('../../store/useTrafficStore')
    const drafted = fresh()
    useTrafficStore.getState().addCampaign({ name: drafted, client: 'Drafts', strategy: 'Demand Gen' })

    const res = (await runAgentAction('listCampaigns', { brand: 'Drafts' })) as {
      result: { campaigns: { name: string; brand: string }[] }
    }
    expect(res.result.campaigns.length).toBeGreaterThan(0)
    expect(res.result.campaigns.every((c) => c.brand === 'Drafts')).toBe(true)
    expect(res.result.campaigns.map((c) => c.name)).toContain(drafted)
  })
})
