// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { registerCampaign } from '../../domain/clients'
import { rtbsForCampaign, registerCampaignRtbs } from '../../domain/rtb'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * A CAMPAIGN'S NAME IS A KEY, AND A RENAME HAS TO MOVE EVERYTHING FILED UNDER IT.
 *
 * The rename repointed the record, the rows, the flights and the open tabs — the half of a campaign
 * you can see. The other half is keyed by the name too and moved nowhere: the BOARD, the chat
 * thread, which canvas was last open, the objects made on the campaign, its fan conditions and its
 * RTBs. So renaming a campaign stood it next to its own board rather than on it — the cards gone,
 * the thread gone, the originals stranded under a name nothing would ask for again.
 *
 * Driven, because every one of these is a plain string in a keyed map: nothing here is a type error,
 * and "did the board come with it" is only answerable by renaming one and looking.
 */

const FROM = 'Big Buoy — Q3 BAU'
const TO = 'Big Buoy — Q4 BAU'

const condition = (id: string) => ({
  id,
  when: { audience: 'Charter Captains' },
  then: { kind: 'angle', value: 'Lead with the charter angle' } as never,
  rationale: 'Because the captains respond to it.',
  confidence: 'medium' as const,
  status: 'proposed' as never,
})

beforeEach(() => {
  registerCampaign(FROM, 'Big Buoy')
  registerCampaignRtbs(FROM, [{ id: 'rtb_1', text: 'Twelve years on the water' } as never])
  window.localStorage.setItem('stoplight.campaignRtbs.v1', JSON.stringify({ [FROM]: [{ id: 'rtb_1', text: 'Twelve years on the water' }] }))
  useTrafficStore.setState({
    sharedSession: null,
    boardsHydrated: true,
    campaignList: [
      { name: FROM, client: 'Big Buoy', strategy: 'Current state' },
      { name: 'Big Buoy — Child', client: 'Big Buoy', strategy: 'Current state', parent: FROM },
    ],
    rows: [],
    flowBoards: [
      { key: FROM, objects: [{ id: 'n_brand', kind: 'brand', text: '', refId: 'bo_buoy' }], placements: [], pos: {}, connectors: [] },
      { key: 'Other campaign', objects: [], placements: [], pos: {}, connectors: [] },
    ],
    flowChats: [
      { id: 'ch_1', flowKey: FROM, title: 'The brief', messages: [], createdAt: 0 },
      { id: 'ch_2', flowKey: 'Other campaign', title: 'Elsewhere', messages: [], createdAt: 0 },
    ],
    smartObjects: [
      { id: 'so_1', name: 'The offer', scope: 'campaign', campaign: FROM, refs: [], contents: [] },
      { id: 'so_2', name: 'Untouched', scope: 'campaign', campaign: 'Other campaign', refs: [], contents: [] },
    ],
    activeCanvas: { [`Big Buoy|${FROM}`]: 'cv_1', 'Big Buoy|Other campaign': 'cv_2' },
    campaignConditions: { [FROM]: [condition('cond_1')], 'Other campaign': [condition('cond_2')] },
    openProjects: [FROM],
  })
})

describe('renameCampaign carries everything keyed by the name', () => {
  it('moves the board, so the campaign does not arrive at its new name empty', async () => {
    await useTrafficStore.getState().renameCampaign(FROM, TO)
    const boards = useTrafficStore.getState().flowBoards
    expect(boards.some((b) => b.key === FROM)).toBe(false)
    expect(boards.find((b) => b.key === TO)?.objects.map((o) => o.id)).toEqual(['n_brand'])
    // Another campaign's board is not touched by the rekey.
    expect(boards.some((b) => b.key === 'Other campaign')).toBe(true)
  })

  it('moves the chat thread, the objects made on it, and the last-open canvas', async () => {
    await useTrafficStore.getState().renameCampaign(FROM, TO)
    const s = useTrafficStore.getState()
    expect(s.flowChats.find((c) => c.id === 'ch_1')?.flowKey).toBe(TO)
    expect(s.flowChats.find((c) => c.id === 'ch_2')?.flowKey).toBe('Other campaign')
    expect(s.smartObjects.find((o) => o.id === 'so_1')?.campaign).toBe(TO)
    expect(s.smartObjects.find((o) => o.id === 'so_2')?.campaign).toBe('Other campaign')
    // Keyed "client|campaign": only the half after the bar is this campaign's.
    expect(s.activeCanvas[`Big Buoy|${TO}`]).toBe('cv_1')
    expect(s.activeCanvas[`Big Buoy|${FROM}`]).toBeUndefined()
    expect(s.activeCanvas['Big Buoy|Other campaign']).toBe('cv_2')
  })

  it('moves the fan conditions and the RTBs the resolver actually reads', async () => {
    await useTrafficStore.getState().renameCampaign(FROM, TO)
    const s = useTrafficStore.getState()
    expect(s.campaignConditions[TO]?.map((c) => c.id)).toEqual(['cond_1'])
    expect(s.campaignConditions[FROM]).toBeUndefined()
    expect(s.campaignConditions['Other campaign']?.map((c) => c.id)).toEqual(['cond_2'])
    // The in-memory registry moves too, not just the stored map: it is what every lookup asks.
    expect(rtbsForCampaign(TO).map((r) => r.id)).toEqual(['rtb_1'])
    expect(rtbsForCampaign(FROM)).toEqual([])
  })

  it('still repoints the record, the child campaign and the open tab', async () => {
    await useTrafficStore.getState().renameCampaign(FROM, TO)
    const s = useTrafficStore.getState()
    expect(s.campaignList.find((c) => c.name === TO)?.client).toBe('Big Buoy')
    expect(s.campaignList.find((c) => c.name === 'Big Buoy — Child')?.parent).toBe(TO)
    expect(s.openProjects).toEqual([TO])
  })

  /** The name is a key, so folding two campaigns together is the one thing a rename must not do. */
  it('refuses a name another campaign already holds, and moves nothing', async () => {
    await useTrafficStore.getState().renameCampaign(FROM, 'Big Buoy — Child')
    const s = useTrafficStore.getState()
    expect(s.campaignList.some((c) => c.name === FROM)).toBe(true)
    expect(s.flowBoards.some((b) => b.key === FROM)).toBe(true)
  })
})
