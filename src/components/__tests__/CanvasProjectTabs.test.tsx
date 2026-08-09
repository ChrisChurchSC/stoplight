// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CanvasProjectTabs } from '../CanvasProjectTabs'
import { registerCampaign, type Campaign } from '../../domain/clients'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * CLOSING A TAB IS NOT NAVIGATION, AND IT IS NOT A DELETE.
 *
 * The ✕ used to move you whenever the tab it closed matched campaignFilter — which names the
 * campaign most recently OPENED and outlives leaving it. So closing a tab while standing on the
 * Campaigns index threw you into another campaign's board, and if that board belonged to another
 * brand it re-scoped the workspace and emptied the index of everything else. Nothing was deleted;
 * everything looked deleted. That is the report this file exists for.
 *
 * Tested rather than trusted because none of it is a type error: campaignFilter is a string either
 * way, and the difference between "the campaign I opened last" and "the campaign on screen" is only
 * visible by driving the click.
 *
 * See BufferedTextarea.test.tsx for why the environment pragma is per-file rather than global.
 */

const campaign = (name: string, client: string): Campaign => ({
  name,
  client,
  strategy: 'Current state',
  status: 'planning',
})

const CAMPAIGNS = [
  campaign('Acme — Alpha', 'Acme'),
  campaign('Acme — Gamma', 'Acme'),
  campaign('Zeta — One', 'Zeta'),
]

let host: HTMLDivElement
let root: Root

/** The workspace as it stands when you are LOOKING AT the Campaigns index, not at a campaign. */
const onTheIndex = {
  page: 'flows' as const,
  flowCanvasOpen: false,
  rows: [],
  campaignList: CAMPAIGNS,
  openProjects: ['Acme — Alpha', 'Acme — Gamma'],
  clientFilter: 'Acme',
  // Stale on purpose: you opened Alpha, then went back to the index, which does not clear this.
  campaignFilter: 'Acme — Alpha',
  openBrandTabs: [],
  openDatasetTabs: [],
  openObjectTabs: [],
  // The prune only runs once the workspace read has landed; leave it un-hydrated so it stays out.
  flightsHydrated: false,
  openProjectsPruned: true,
  // Reset per test: openFlow writes this, and a value left over from the previous test would scope
  // the strip to a brand that test never picked.
  scopeBeforeFlow: null,
  sharedSession: null,
}

beforeEach(() => {
  for (const c of CAMPAIGNS) registerCampaign(c.name, c.client)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useTrafficStore.setState(onTheIndex)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useTrafficStore.setState({ ...onTheIndex, openProjects: [], campaignList: [], campaignFilter: 'all' })
})

/** The names showing in the strip right now, left to right. */
const tabNames = () => [...host.querySelectorAll('.cv-project-tab-name')].map((n) => n.textContent)

/** The tab named `short` itself, e.g. 'Alpha' — a click on the tab, not on its ✕. */
const clickTab = (short: string) => {
  const tab = [...host.querySelectorAll('.cv-project-tab')].find((t) =>
    t.querySelector('.cv-project-tab-name')?.textContent?.includes(short),
  )
  act(() => {
    tab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** Leave the board, the way the rail's back arrow and the breadcrumb's home both do. */
const goBack = () => {
  act(() => {
    useTrafficStore.setState({ flowCanvasOpen: false })
    useTrafficStore.getState().goFlowHome()
  })
}

/** The ✕ on the tab named `short`, e.g. 'Alpha'. */
const closeTab = (short: string) => {
  const tab = [...host.querySelectorAll('.cv-project-tab')].find((t) => t.textContent?.includes(short))
  act(() => {
    tab?.querySelector('.cv-project-tab-x')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('CanvasProjectTabs — closing a campaign tab', () => {
  it('closes only the tab, and leaves you on the Campaigns page', () => {
    act(() => root.render(<CanvasProjectTabs />))

    closeTab('Alpha')

    const s = useTrafficStore.getState()
    expect(s.openProjects).toEqual(['Acme — Gamma'])
    // Not thrown into Gamma's board.
    expect(s.flowCanvasOpen).toBe(false)
    expect(s.flowOpen).toBeNull()
  })

  it('never removes the campaign itself — only deleting does that', () => {
    act(() => root.render(<CanvasProjectTabs />))

    closeTab('Alpha')

    const listed = useTrafficStore.getState().campaignList
    expect(listed.map((c) => c.name)).toContain('Acme — Alpha')
    expect(listed.find((c) => c.name === 'Acme — Alpha')?.archivedAt).toBeUndefined()
  })

  it('opens a sibling tab when you close the campaign you are looking at', () => {
    useTrafficStore.setState({ flowCanvasOpen: true })
    act(() => root.render(<CanvasProjectTabs />))

    closeTab('Alpha')

    const s = useTrafficStore.getState()
    expect(s.openProjects).toEqual(['Acme — Gamma'])
    expect(s.flowOpen).toBe('Acme — Gamma')
  })

  it('goes back to the Campaigns index when the campaign you are looking at was the last tab', () => {
    useTrafficStore.setState({ flowCanvasOpen: true, openProjects: ['Acme — Alpha'] })
    const before = useTrafficStore.getState().flowHomeNonce
    act(() => root.render(<CanvasProjectTabs />))

    closeTab('Alpha')

    const s = useTrafficStore.getState()
    expect(s.openProjects).toEqual([])
    // Asked to leave the board, rather than stranding you on a campaign with no tab.
    expect(s.flowHomeNonce).toBe(before + 1)
    // And no tab reads as active any more.
    expect(s.campaignFilter).toBe('all')
  })

  it('keeps the brand scope when you were browsing every brand', () => {
    useTrafficStore.setState({
      flowCanvasOpen: true,
      clientFilter: 'all',
      openProjects: ['Acme — Alpha', 'Acme — Gamma', 'Zeta — One'],
    })
    act(() => root.render(<CanvasProjectTabs />))

    closeTab('Alpha')

    const s = useTrafficStore.getState()
    // A sibling of the SAME brand, and the index still shows every brand's campaigns.
    expect(s.flowOpen).toBe('Acme — Gamma')
    expect(s.clientFilter).toBe('all')
  })
})

/**
 * OPENING A CAMPAIGN FROM THE STRIP MUST NOT EMPTY THE STRIP.
 *
 * The report: "when I click a tab of a campaign, and then go back, it loses the other tabs of the
 * campaigns." Two separate faults on the one gesture, and neither is a type error.
 *
 * One, openFlow narrows clientFilter to its campaign's brand — the board needs it — and the strip
 * filtered on clientFilter. So clicking a tab deleted every tab belonging to any other brand, from
 * the one strip whose whole job is to say what you have open. Nothing had closed.
 *
 * Two, the tab you came back FROM was then a dead click, because switchTo skipped any campaign
 * matching campaignFilter and campaignFilter still names the campaign you left. So the one tab you
 * are most likely to want back was the one that did nothing.
 */
describe('CanvasProjectTabs — opening a campaign from the strip', () => {
  /** Every brand's tabs open, and the index browsing all of them. */
  const browsingEveryBrand = {
    clientFilter: 'all',
    campaignFilter: 'all',
    openProjects: ['Acme — Alpha', 'Acme — Gamma', 'Zeta — One'],
    scopeBeforeFlow: null,
  }

  it('keeps the other brand’s tabs while you are inside a campaign', () => {
    useTrafficStore.setState(browsingEveryBrand)
    act(() => root.render(<CanvasProjectTabs />))
    expect(tabNames()).toEqual(['Alpha', 'Gamma', 'One'])

    clickTab('Alpha')
    act(() => useTrafficStore.setState({ flowCanvasOpen: true }))

    // The board is scoped to Acme, which is right for the board. The drawer is not the board.
    expect(useTrafficStore.getState().clientFilter).toBe('Acme')
    expect(tabNames()).toEqual(['Alpha', 'Gamma', 'One'])
  })

  it('still has them all when you come back out', () => {
    useTrafficStore.setState(browsingEveryBrand)
    act(() => root.render(<CanvasProjectTabs />))

    clickTab('Alpha')
    act(() => useTrafficStore.setState({ flowCanvasOpen: true }))
    goBack()

    expect(useTrafficStore.getState().clientFilter).toBe('all')
    expect(tabNames()).toEqual(['Alpha', 'Gamma', 'One'])
  })

  it('re-opens the campaign you just left when you click its tab again', () => {
    useTrafficStore.setState(browsingEveryBrand)
    act(() => root.render(<CanvasProjectTabs />))

    clickTab('Alpha')
    act(() => useTrafficStore.setState({ flowCanvasOpen: true }))
    goBack()
    // campaignFilter still names Alpha here — that is the trap the old guard fell into.
    expect(useTrafficStore.getState().campaignFilter).toBe('Acme — Alpha')

    act(() => useTrafficStore.setState({ flowOpen: null }))
    clickTab('Alpha')

    expect(useTrafficStore.getState().flowOpen).toBe('Acme — Alpha')
  })

  it('does nothing when you click the tab of the board already on screen', () => {
    useTrafficStore.setState(browsingEveryBrand)
    act(() => root.render(<CanvasProjectTabs />))

    clickTab('Alpha')
    act(() => useTrafficStore.setState({ flowCanvasOpen: true, flowOpen: null }))
    clickTab('Alpha')

    // The one click there is genuinely nothing to do about.
    expect(useTrafficStore.getState().flowOpen).toBeNull()
  })

  it('still hides another brand’s tabs when you PICK a brand', () => {
    // The narrowing a campaign borrows is undone; a brand you chose is a choice, and the strip
    // follows it. setClientFilter clears scopeBeforeFlow, which is what makes the two tellable apart.
    useTrafficStore.setState(browsingEveryBrand)
    act(() => root.render(<CanvasProjectTabs />))

    act(() => useTrafficStore.getState().setClientFilter('Zeta'))

    expect(tabNames()).toEqual(['One'])
  })

  it('follows the brand you picked, not all brands, after a campaign inside it', () => {
    useTrafficStore.setState(browsingEveryBrand)
    act(() => root.render(<CanvasProjectTabs />))
    act(() => useTrafficStore.getState().setClientFilter('Acme'))

    clickTab('Alpha')
    act(() => useTrafficStore.setState({ flowCanvasOpen: true }))
    expect(tabNames()).toEqual(['Alpha', 'Gamma'])

    goBack()
    expect(useTrafficStore.getState().clientFilter).toBe('Acme')
    expect(tabNames()).toEqual(['Alpha', 'Gamma'])
  })
})

/**
 * A CAMPAIGN THAT IS NOBODY'S YET STILL HAS TO BE IN THE STRIP.
 *
 * A campaign now starts in the Drafts space and stays there until a Brand card gives it a brand, so
 * "no brand" went from an edge case to the state every campaign passes through. The strip's scope
 * filter is there to keep one brand's work out of another brand's tabs, and held to the plain rule —
 * does this campaign's client equal the brand you are browsing — a draft matched nothing: you
 * started a campaign, it opened on screen, and the one strip whose job is to say what you have open
 * did not have it. The way back to it was the Campaigns page, and the ✕ that closes it lives in the
 * strip it was missing from.
 *
 * Drafts cannot leak the way a brand can, which is what makes showing it at every scope safe rather
 * than merely convenient.
 */
describe('CanvasProjectTabs — a draft campaign', () => {
  const DRAFT = 'Untitled campaign'

  beforeEach(() => {
    registerCampaign(DRAFT, 'Drafts')
    useTrafficStore.setState({
      ...onTheIndex,
      campaignList: [...CAMPAIGNS, campaign(DRAFT, 'Drafts')],
      openProjects: ['Acme — Alpha', DRAFT],
    })
  })

  it('shows while you are browsing a brand it does not belong to', () => {
    act(() => root.render(<CanvasProjectTabs />))
    expect(useTrafficStore.getState().clientFilter).toBe('Acme')
    expect(tabNames()).toContain(DRAFT)
  })

  it('shows at every brand, because it is not any brand’s work to leak', () => {
    act(() => root.render(<CanvasProjectTabs />))
    act(() => useTrafficStore.getState().setClientFilter('Zeta'))
    expect(tabNames()).toContain(DRAFT)
    // And the other brand's campaign is still filtered out, so the rule has not simply been dropped.
    expect(tabNames()).not.toContain('Alpha')
  })
})
