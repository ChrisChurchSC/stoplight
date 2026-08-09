// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { DRAFTS_SPACE, UNASSIGNED, registerCampaign } from '../../domain/clients'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * THE BRAND HALF OF THE GENERATION GATE — "is there a voice to write in at all".
 *
 * copyBlockerFor asked isBrandless, which answers for Unassigned and nothing else. That was enough
 * while every campaign landed on a brand by default: Unassigned was the only way to arrive here
 * without one. A campaign now STARTS in the Drafts space and stays there until a Brand card gives it
 * a brand, so Drafts is the state every campaign passes through — and every other resolver in the
 * app already excludes it by name (canvasBrandScope, the canvas's own brand, healCampaignBrand)
 * because it is a shelf for work that is nobody's yet. This gate read it as a client, so the copy
 * would have been drawn from the Drafts bucket: one placeholder audience and no proof.
 */

const wired = (key: string) => ({
  key,
  objects: [{ id: 'c1', kind: 'audience' as const, text: '' }],
  placements: [],
  pos: {},
  connectors: [{ from: 'c1', to: 'campaign' }],
})

beforeEach(() => {
  useTrafficStore.setState({
    brandMeta: {},
    flowBoards: [wired('Drafty'), wired('Nobody’s'), wired('Big Buoy — Q3')],
  })
})

describe('copyBlockerFor: the brand half', () => {
  it('refuses a campaign sitting in the Drafts space', () => {
    registerCampaign('Drafty', DRAFTS_SPACE)
    expect(useTrafficStore.getState().copyBlockerFor('Drafty')).toMatch(/bind .* to a brand/i)
  })

  it('still refuses an unassigned campaign', () => {
    registerCampaign('Nobody’s', UNASSIGNED)
    expect(useTrafficStore.getState().copyBlockerFor('Nobody’s')).toMatch(/bind .* to a brand/i)
  })

  /** The gate has to OPEN once a Brand card has been wired, or starting brandless is a dead end. */
  it('lets a campaign with a real brand through to the wiring check', () => {
    registerCampaign('Big Buoy — Q3', 'Big Buoy')
    expect(useTrafficStore.getState().copyBlockerFor('Big Buoy — Q3')).toBeNull()
  })
})
