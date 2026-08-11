// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useTaskCounts } from '../assetTasks'
import { registerCampaign } from '../../domain/clients'
import { useTrafficStore } from '../../store/useTrafficStore'
import type { TrafficRow } from '../../domain/types'

/**
 * THE BADGE COUNTS WHAT THE PAGE LISTS.
 *
 * The nav's Tasks badge used to read the hand-made tasks alone, and agreed with the page only by
 * accident: while asset-tasks were dropped whenever no brand was picked, both showed nothing.
 * Fixing the page's scoping left the badge behind, and a board of thirty-one open tasks wore a "1".
 *
 * A count in the nav is a promise about the page it points at. Counting a different set does not
 * make it a smaller number, it makes it a wrong one — and nothing about either implementation says
 * which set it is counting, which is why it is worth a test rather than a reading.
 */

const BRAND = 'Acme'
const CAMPAIGN = 'Acme — Fall Launch'
const MANUAL_KEY = 'stoplight.tasks.v1'

const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  d.setHours(10, 0, 0, 0)
  return d
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const row = (over: Partial<TrafficRow> = {}): TrafficRow => ({
  id: 'row-1',
  assetId: '',
  assetName: 'Teaser post',
  mediaType: 'image',
  channel: 'instagram',
  assetType: 'single_image',
  messaging: {},
  campaign: CAMPAIGN,
  audience: '',
  status: 'draft',
  scheduledAt: day(3).toISOString(),
  createdAt: Date.now(),
  ...over,
})

let host: HTMLDivElement
let root: Root
let seen: { open: number; overdue: number }

function Probe({ brand }: { brand: string }) {
  seen = useTaskCounts(brand)
  return null
}

beforeEach(() => {
  registerCampaign(CAMPAIGN, BRAND)
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  localStorage.clear()
  useTrafficStore.setState({ rows: [], clientFilter: 'all' })
})

describe('useTaskCounts', () => {
  it('counts the assets as well as the hand-made tasks', () => {
    useTrafficStore.setState({
      rows: [row(), row({ id: 'row-2', assetName: 'Second post' })],
      clientFilter: BRAND,
    })
    localStorage.setItem(
      MANUAL_KEY,
      JSON.stringify([{ id: 't1', text: 'Book the photographer', due: ymd(day(2)), done: false, brand: BRAND }]),
    )

    act(() => root.render(<Probe brand={BRAND} />))

    // Two assets and one hand-made task — not the 1 the badge used to show.
    expect(seen.open).toBe(3)
  })

  it('counts every brand when no brand is picked, like the page does', () => {
    useTrafficStore.setState({ rows: [row(), row({ id: 'row-2', assetName: 'Second post' })], clientFilter: 'all' })
    act(() => root.render(<Probe brand="" />))
    expect(seen.open).toBe(2)
  })

  it('reports overdue over both kinds, and leaves done out of both counts', () => {
    useTrafficStore.setState({
      rows: [
        row({ id: 'row-late', scheduledAt: day(-4).toISOString() }),
        row({ id: 'row-soon', scheduledAt: day(4).toISOString() }),
      ],
      clientFilter: BRAND,
    })
    localStorage.setItem(
      MANUAL_KEY,
      JSON.stringify([
        { id: 't1', text: 'Late one', due: ymd(day(-1)), done: false, brand: BRAND },
        { id: 't2', text: 'Already handled', due: ymd(day(-9)), done: true, brand: BRAND },
      ]),
    )

    act(() => root.render(<Probe brand={BRAND} />))

    expect(seen.open, 'the done one is not open').toBe(3)
    expect(seen.overdue, 'one late asset and one late task').toBe(2)
  })
})
