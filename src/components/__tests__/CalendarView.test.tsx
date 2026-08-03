// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarView } from '../CalendarView'
import { useTrafficStore } from '../../store/useTrafficStore'
import type { TrafficRow } from '../../domain/types'

/**
 * THE CALENDAR DOES NOT OPEN THE EDIT-ROW DRAWER. Inside a campaign an asset opens the docked
 * inspector, which sits beside the calendar; on the calendars that stand alone (Live, the brand
 * folder, the workbench) the click used to throw the whole review drawer over the schedule you were
 * reading, and now opens nothing at all — the asset is a mark on a day.
 *
 * It is tested rather than trusted because the drawer is opened through the store: nothing about
 * `openReview` being called from a calendar is a type error, a lint error, or visible in a build,
 * and the last two commits here were both about a click on this view opening the wrong panel.
 *
 * See BufferedTextarea.test.tsx for why the environment pragma is per-file rather than global.
 */

const row = (over: Partial<TrafficRow> = {}): TrafficRow => {
  const at = new Date()
  at.setHours(10, 0, 0, 0)
  return {
    id: 'row-1',
    assetId: '',
    assetName: 'Meta single-image ad',
    mediaType: 'image',
    channel: 'meta-ads',
    assetType: 'single_image',
    messaging: {},
    campaign: 'New campaign',
    audience: '',
    status: 'draft',
    scheduledAt: at.toISOString(),
    createdAt: Date.now(),
    ...over,
  }
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useTrafficStore.setState({ rows: [row()], reviewRowId: null })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useTrafficStore.setState({ rows: [], reviewRowId: null })
})

/** The asset as it renders in a quiet month cell, which is the calendar's default range. */
const asset = () => host.querySelector('.cal-day-item')

describe('CalendarView', () => {
  it('shows the asset without offering a click, on a calendar with nowhere to open it', () => {
    act(() => root.render(<CalendarView />))

    const el = asset()
    expect(el?.textContent).toContain('Meta single-image ad')
    expect(el?.tagName).toBe('DIV')
  })

  it('never opens the review drawer, however the asset is clicked', () => {
    act(() => root.render(<CalendarView />))

    act(() => {
      asset()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useTrafficStore.getState().reviewRowId).toBeNull()
  })

  it('opens the docked inspector inside a campaign, where there is one to open', () => {
    const picked: string[] = []
    act(() => root.render(<CalendarView onPickRow={(id) => picked.push(id)} />))

    const el = asset()
    expect(el?.tagName).toBe('BUTTON')

    act(() => {
      el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(picked).toEqual(['row-1'])
    expect(useTrafficStore.getState().reviewRowId).toBeNull()
  })
})
