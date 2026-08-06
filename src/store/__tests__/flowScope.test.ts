// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { registerCampaign, type Campaign } from '../../domain/clients'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * LEAVING A CAMPAIGN GIVES THE INDEX BACK THE SCOPE THE CAMPAIGN BORROWED.
 *
 * openFlow re-scopes the workspace to its campaign's brand, which is right for a board and wrong
 * for the page you land on when you leave one. The Campaigns index reads clientFilter three ways
 * at once: it hides other brands' campaigns, it swaps campaignFolders to that brand's folder list,
 * and it filters the tab strip. So a scope left narrowed on the way out did not merely hide a
 * brand. It emptied folders of campaigns that were still in them, and dropped campaigns filed
 * under a folder the narrowed list did not contain into DRAFTS. The report was four campaigns in
 * three folders coming back as three campaigns, one folder reading 0, and a filed campaign
 * presenting as an unfiled draft, from one press of the back arrow. Nothing had moved.
 *
 * Tested rather than trusted because every value here is a plain string and none of it is a type
 * error: the difference between "the scope this board wants" and "the scope you were browsing at"
 * is only visible by driving the navigation in order.
 *
 * See CanvasProjectTabs.test.tsx for why the environment pragma is per-file rather than global.
 */

const campaign = (name: string, client: string): Campaign => ({
  name,
  client,
  strategy: 'Current state',
  status: 'planning',
})

const CAMPAIGNS = [
  campaign('Big Buoy — Hurricane Season', 'Big Buoy'),
  campaign('Concis Labs — Q3/Q4 Bau', 'Concis Labs'),
]

const scope = () => useTrafficStore.getState().clientFilter

beforeEach(() => {
  for (const c of CAMPAIGNS) registerCampaign(c.name, c.client)
  useTrafficStore.setState({
    page: 'flows',
    campaignList: CAMPAIGNS,
    openProjects: [],
    clientFilter: 'all',
    campaignFilter: 'all',
    sharedSession: null,
    scopeBeforeFlow: null,
  })
})

describe('the index scope across a campaign', () => {
  it('narrows to the campaign brand on the way in', () => {
    useTrafficStore.getState().openFlow('Big Buoy — Hurricane Season')
    expect(scope()).toBe('Big Buoy')
  })

  it('is every brand again on the way back out', () => {
    useTrafficStore.getState().openFlow('Big Buoy — Hurricane Season')
    useTrafficStore.getState().goFlowHome()
    expect(scope()).toBe('all')
  })

  it('survives switching campaign to campaign before leaving', () => {
    // A tab click and the breadcrumb switcher both run openFlow again, with clientFilter ALREADY
    // narrowed by the campaign being left. Capturing on every open would remember 'Big Buoy' here
    // and restore that, so the index would come back scoped to a brand nobody chose.
    useTrafficStore.getState().openFlow('Big Buoy — Hurricane Season')
    useTrafficStore.getState().openFlow('Concis Labs — Q3/Q4 Bau')
    expect(scope()).toBe('Concis Labs')
    useTrafficStore.getState().goFlowHome()
    expect(scope()).toBe('all')
  })

  it('restores a brand you chose rather than widening past it', () => {
    // The narrowing is undone; the choice is not. Forcing 'all' on the way out would throw away a
    // scope the user set deliberately, which is a different bug in the other direction.
    useTrafficStore.getState().setClientFilter('Concis Labs')
    useTrafficStore.getState().openFlow('Big Buoy — Hurricane Season')
    expect(scope()).toBe('Big Buoy')
    useTrafficStore.getState().goFlowHome()
    expect(scope()).toBe('Concis Labs')
  })

  it('leaves the scope alone when no campaign ever narrowed it', () => {
    // The index opens campaigns without going through openFlow, so there is nothing to put back
    // and goFlowHome must not invent an answer.
    useTrafficStore.getState().setClientFilter('Concis Labs')
    useTrafficStore.getState().goFlowHome()
    expect(scope()).toBe('Concis Labs')
  })

  it('forgets the remembered scope once a brand is picked inside a campaign', () => {
    // Picking a brand makes that the scope, so there is no earlier one to go back to.
    useTrafficStore.getState().openFlow('Big Buoy — Hurricane Season')
    useTrafficStore.getState().setClientFilter('Concis Labs')
    useTrafficStore.getState().goFlowHome()
    expect(scope()).toBe('Concis Labs')
  })
})
