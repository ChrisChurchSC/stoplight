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

  it('lists a campaign that exists only as the name its assets carry', async () => {
    // The other way a campaign is real: nothing registered it, a live asset just names it. Ingested
    // assets arrive this way, and a listing built from the register alone would answer "no such
    // campaign" about one with work in it.
    const { useTrafficStore } = await import('../../store/useTrafficStore')
    const campaign = fresh()
    const rows = useTrafficStore.getState().rows
    await useTrafficStore.getState().applyRowsSnapshot([
      ...rows,
      { ...rows[0], id: `unregistered_${campaign}`, assetName: `${campaign} asset`, campaign },
    ])

    const res = (await runAgentAction('listCampaigns', {})) as {
      result: { campaigns: { name: string; registered: boolean; assets: number }[]; note: string }
    }
    const found = res.result.campaigns.find((c) => c.name === campaign)
    expect(found, 'a campaign carried only by a row must still be listed').toBeTruthy()
    expect(found!.registered).toBe(false)
    expect(found!.assets).toBe(1)
    expect(res.result.note).toMatch(/only as the name their assets carry/)
  })

  it('reads the brand off the BOARD when the record has not caught up', async () => {
    /**
     * THE ONE THAT COST THE MOST. bindCampaignBrand writes the campaign record only when a Brand
     * card is wired into the brief, so a campaign can name its brand on the board and nowhere else
     * — visible to the person under that brand, brandless to anything reading the record. Asked
     * about such a campaign the connector answered "Drafts", get_brand said the brand had no
     * campaigns at all, and a session reading that pair concluded this was a different database and
     * offered to rebuild the work.
     */
    const { useTrafficStore } = await import('../../store/useTrafficStore')
    const campaign = fresh()
    const st = useTrafficStore.getState()
    st.addClient('World Within')
    // A campaign filed nowhere...
    st.addCampaign({ name: campaign, client: 'Drafts', strategy: 'Demand Gen' })
    // ...whose board carries a Brand card wired into the brief.
    const brandObj = { id: `br_${campaign}`, name: 'World Within' }
    useTrafficStore.setState({ brandObjects: [...st.brandObjects, brandObj] as never })
    useTrafficStore.getState().saveFlowBoard({
      key: campaign,
      objects: [{ id: 'n1', kind: 'brand', refId: brandObj.id, text: '' }] as never,
      placements: [],
      pos: {},
      connectors: [{ from: 'n1', to: 'campaign' }] as never,
    })

    const res = (await runAgentAction('listCampaigns', {})) as {
      result: { campaigns: { name: string; brand: string }[] }
    }
    expect(res.result.campaigns.find((c) => c.name === campaign)!.brand).toBe('World Within')

    // And the brand stops claiming it has no campaigns.
    const brand = (await runAgentAction('getBrand', { brand: 'World Within' })) as { result: { campaigns: string[] } }
    expect(brand.result.campaigns).toContain(campaign)
  })

  it('finds that campaign’s assets under the brand, which is where the damage was', async () => {
    /**
     * The same blind spot in the call that matters most. Asked for World Within's assets, list_assets
     * matched on the record and returned NOTHING for a campaign holding eight drafts — so a session
     * concluded the campaign was an empty scaffold and offered to write a full set into it. That is
     * not a bad read, it is duplicate work on top of real work.
     */
    const { useTrafficStore } = await import('../../store/useTrafficStore')
    const campaign = fresh()
    const st = useTrafficStore.getState()
    st.addClient('World Within')
    st.addCampaign({ name: campaign, client: 'Drafts', strategy: 'Demand Gen' })
    const brandObj = { id: `br_${campaign}`, name: 'World Within' }
    useTrafficStore.setState({ brandObjects: [...st.brandObjects, brandObj] as never })
    useTrafficStore.getState().saveFlowBoard({
      key: campaign,
      objects: [{ id: 'n1', kind: 'brand', refId: brandObj.id, text: '' }] as never,
      placements: [],
      pos: {},
      connectors: [{ from: 'n1', to: 'campaign' }] as never,
    })
    await runAgentAction('addAsset', { brand: 'Drafts', campaign, channel: 'linkedin', assetName: `${campaign} post` })

    const res = (await runAgentAction('listAssets', { brand: 'World Within', campaign })) as {
      result: { total: number; assets: { assetName: string }[] }
    }
    expect(res.result.total, 'the brand must find the assets of a campaign bound to it by the board').toBe(1)
    expect(res.result.assets[0].assetName).toBe(`${campaign} post`)
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
