// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FlowsHome } from '../FlowsHome'
import { useTrafficStore } from '../../store/useTrafficStore'
import { registerCampaign } from '../../domain/clients'
import type { TrafficRow } from '../../domain/types'

/**
 * WHAT A CAMPAIGN CARD COUNTS.
 *
 * The card's one line of numbers said "N channels" while counting distinct channel/assetType
 * PAIRS, and the icon row directly beneath it drew distinct channels. So a card read "10 channels"
 * above five icons with no overflow badge, contradicting itself by one row, and neither the type
 * checker nor any test could see it: both are numbers, and both were right about something.
 *
 * Pinned at the rendered card, against a campaign with two asset types on one channel — the
 * smallest shape where the two counts disagree.
 *
 * See BufferedTextarea.test.tsx for why the environment pragma is per-file rather than global.
 */

const BRAND = 'Northwind'
const CAMPAIGN = 'Storm season'

const row = (over: Partial<TrafficRow> = {}): TrafficRow => ({
  id: 'row_1',
  assetId: '',
  assetName: 'Launch post',
  mediaType: 'image',
  channel: 'linkedin',
  assetType: 'single_image',
  messaging: {},
  campaign: CAMPAIGN,
  client: BRAND,
  audience: '',
  status: 'draft',
  scheduledAt: new Date().toISOString(),
  createdAt: Date.now(),
  ...over,
})

type Store = ReturnType<typeof useTrafficStore.getState>

const seed = (over: Partial<Store> = {}) => {
  // A row is scoped to a brand through its CAMPAIGN, never through its own client field, and the
  // page refuses to list anything until BOTH rows and records have landed.
  registerCampaign(CAMPAIGN, BRAND)
  useTrafficStore.setState({
    rows: [
      row(),
      row({ id: 'row_2', assetName: 'Launch video', mediaType: 'video', assetType: 'video' }),
    ],
    campaignList: [{ name: CAMPAIGN, client: BRAND, strategy: 'Current state' }],
    clientFilter: BRAND,
    rowsHydrated: true,
    boardsHydrated: true,
    ...over,
  })
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useTrafficStore.setState({ rows: [], campaignList: [], rowsHydrated: false, boardsHydrated: false })
})

const render = () =>
  act(() => {
    root.render(<FlowsHome brand={BRAND} onOpen={() => {}} onNew={() => {}} />)
  })

describe('a campaign card in the index', () => {
  it('counts the channels it draws, not the asset types within them', () => {
    seed()
    render()

    const meta = host.querySelector('.flow-home-card-meta')?.textContent ?? ''
    const icons = host.querySelectorAll('.flow-home-chan-ico').length

    expect(icons).toBe(1)
    expect(meta).toContain('1 channel ')
    expect(meta).toContain('2 assets')
  })

  it('says one channel per channel, however many assets sit on it', () => {
    seed({
      rows: [
        row(),
        row({ id: 'row_2', channel: 'instagram', assetType: 'single_image' }),
        row({ id: 'row_3', channel: 'instagram', assetType: 'reel', mediaType: 'video' }),
      ],
    })
    render()

    expect(host.querySelectorAll('.flow-home-chan-ico').length).toBe(2)
    expect(host.querySelector('.flow-home-card-meta')?.textContent ?? '').toContain('2 channels')
  })
})
