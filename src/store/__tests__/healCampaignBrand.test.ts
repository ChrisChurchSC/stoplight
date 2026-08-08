// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { newAudience } from '../../domain/audiences'
import { clientForCampaign, registerCampaign } from '../../domain/clients'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * THE RECORD CATCHES UP WITH THE BOARD, AND THE AUDIENCES FOLLOW THE CAMPAIGN.
 *
 * bindBrandFromCard writes a campaign's brand at the moment its Brand card is WIRED, so a board
 * wired before that code existed carries the brand on the card and nowhere else. openFlow then
 * pointed the rail at clientForCampaign — UNASSIGNED — and every record list on the canvas scoped
 * to a phantom brand: audiences authored there were filed under clientAudiences['Unassigned'],
 * where no brand-scoped lookup (the grid's picker, the canvas's own dropdowns, generation) could
 * see them. A tag plainly on the canvas resolved to nothing on the grid, repeatedly, because the
 * two surfaces read whichever bucket the day's navigation had scoped.
 *
 * Driven, because every value here is a plain string in a keyed map and none of it is a type
 * error: "which bucket did the record land in" is only answerable by opening a campaign and
 * looking.
 */

const CAMPAIGN = 'Big Buoy — Q3 BAU'

const seg = (id: string, name: string) => newAudience({ id, name })

beforeEach(() => {
  registerCampaign(CAMPAIGN, 'Unassigned')
  useTrafficStore.setState({
    sharedSession: null,
    campaignList: [{ name: CAMPAIGN, client: 'Unassigned', strategy: 'Current state' }],
    brandObjects: [{ id: 'bo_buoy', name: 'Big Buoy' }],
    flowBoards: [
      {
        key: CAMPAIGN,
        objects: [
          { id: 'n_brand', kind: 'brand', text: '', refId: 'bo_buoy' },
          { id: 'n_aud', kind: 'audience', text: '', refId: 'aud_card' },
        ],
        placements: [],
        pos: {},
        connectors: [{ from: 'n_brand', to: 'campaign' }],
      },
    ],
    rows: [],
    clientAudiences: {
      Unassigned: [seg('aud_card', 'Charter Captains'), seg('aud_stray', 'Nobody references this')],
      'World Within': [seg('aud_other', 'Someone else’s shelf')],
    },
  })
})

describe('healCampaignBrand', () => {
  it('binds the record from the Brand card wired into the brief', () => {
    const brand = useTrafficStore.getState().healCampaignBrand(CAMPAIGN)

    expect(brand).toBe('Big Buoy')
    expect(useTrafficStore.getState().campaignList.find((c) => c.name === CAMPAIGN)?.client).toBe('Big Buoy')
    // The resolver every reader actually asks moves with the record.
    expect(clientForCampaign(CAMPAIGN)).toBe('Big Buoy')
  })

  it('moves the audiences the campaign references onto the brand’s shelf, and only those', () => {
    useTrafficStore.getState().healCampaignBrand(CAMPAIGN)

    const buckets = useTrafficStore.getState().clientAudiences
    expect((buckets['Big Buoy'] ?? []).map((a) => a.id)).toEqual(['aud_card'])
    // Unreferenced records stay put: "in the catch-all" is not evidence of belonging to anyone.
    expect((buckets['Unassigned'] ?? []).map((a) => a.id)).toEqual(['aud_stray'])
    // Another brand's shelf is never touched.
    expect((buckets['World Within'] ?? []).map((a) => a.id)).toEqual(['aud_other'])
  })

  it('adopts the segments the rows pin, not only the ones on cards', () => {
    useTrafficStore.setState({
      rows: [
        {
          id: 'r1',
          campaign: CAMPAIGN,
          references: [{ type: 'segment', id: 'aud_stray', label: 'Nobody references this' }],
        },
      ] as never,
    })

    useTrafficStore.getState().healCampaignBrand(CAMPAIGN)

    const buckets = useTrafficStore.getState().clientAudiences
    expect((buckets['Big Buoy'] ?? []).map((a) => a.id).sort()).toEqual(['aud_card', 'aud_stray'])
    expect(buckets['Unassigned'] ?? []).toEqual([])
  })

  it('still adopts for a campaign whose record is already bound', () => {
    // The bind and the adoption are separate repairs: a campaign filed by hand years ago can still
    // hold references into the catch-all bucket.
    useTrafficStore.setState({
      campaignList: [{ name: CAMPAIGN, client: 'Big Buoy', strategy: 'Current state' }],
    })
    registerCampaign(CAMPAIGN, 'Big Buoy')

    const brand = useTrafficStore.getState().healCampaignBrand(CAMPAIGN)

    expect(brand).toBe('Big Buoy')
    expect((useTrafficStore.getState().clientAudiences['Big Buoy'] ?? []).map((a) => a.id)).toEqual(['aud_card'])
  })

  it('re-syncs the resolver when the record is right and the registry never learnt it', () => {
    /**
     * The state a synced workspace boots into: campaignList hydrates from the backend with the
     * campaign correctly filed, while clientForCampaign — seeded from this device's localStorage —
     * has never heard the name and answers Unassigned. Every reader that asks the resolver then
     * contradicts the record: rowInScope drops the campaign's rows, so its grid renders BLANK while
     * its canvas shows every asset. The heal used to skip the bind entirely for a filed record,
     * which left the disagreement in place; it must re-register even when it has nothing to file.
     */
    useTrafficStore.setState({
      campaignList: [{ name: CAMPAIGN, client: 'Big Buoy', strategy: 'Current state' }],
    })
    registerCampaign(CAMPAIGN, 'Unassigned')

    const brand = useTrafficStore.getState().healCampaignBrand(CAMPAIGN)

    expect(brand).toBe('Big Buoy')
    expect(clientForCampaign(CAMPAIGN)).toBe('Big Buoy')
  })

  it('does nothing for a board that names no brand', () => {
    useTrafficStore.setState({ flowBoards: [] })
    registerCampaign(CAMPAIGN, 'Unassigned')

    expect(useTrafficStore.getState().healCampaignBrand(CAMPAIGN)).toBe('')
    expect(useTrafficStore.getState().campaignList.find((c) => c.name === CAMPAIGN)?.client).toBe('Unassigned')
  })

  it('does nothing in a shared session', () => {
    useTrafficStore.setState({
      sharedSession: { client: 'Big Buoy', role: 'stakeholder', id: 'shr_x' } as never,
    })

    expect(useTrafficStore.getState().healCampaignBrand(CAMPAIGN)).toBe('')
    expect(useTrafficStore.getState().campaignList.find((c) => c.name === CAMPAIGN)?.client).toBe('Unassigned')
  })

  it('openFlow narrows the rail to the healed brand, not to "Unassigned"', () => {
    useTrafficStore.setState({ clientFilter: 'all', scopeBeforeFlow: null, openProjects: [] })

    useTrafficStore.getState().openFlow(CAMPAIGN)

    expect(useTrafficStore.getState().clientFilter).toBe('Big Buoy')
  })
})
