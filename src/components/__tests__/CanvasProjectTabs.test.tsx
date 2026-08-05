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
