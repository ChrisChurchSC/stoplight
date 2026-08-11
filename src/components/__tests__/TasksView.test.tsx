// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TasksView } from '../TasksView'
import { registerCampaign } from '../../domain/clients'
import { useTrafficStore } from '../../store/useTrafficStore'
import type { TrafficRow } from '../../domain/types'

/**
 * A TASK'S CAMPAIGN IS A COLUMN, NOT A ROW TYPE. Derived asset-tasks always carried a campaign;
 * hand-made ones could only link to a Company, so the third column meant "campaign" on one row and
 * "company" on the next and matched its own header on neither.
 *
 * Both halves are tested rather than trusted because both fail silently. `campaign` is optional on
 * Task, so a picker that stops writing it is not a type error and not visible in a build — the
 * chip just never fills in. And the columns line up only by each row rendering the same number of
 * cells as the header, which nothing checks at compile time: drop one and every cell after it
 * slides a column left, which is the bug this replaced.
 *
 * See BufferedTextarea.test.tsx for why the environment pragma is per-file rather than global.
 */

const KEY = 'stoplight.tasks.v1'
const BRAND = 'Acme'
const CAMPAIGN = 'Acme — Fall Launch'
const OTHER_BRAND = 'Globex'
const OTHER_CAMPAIGN = 'Globex — Spring Push'

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
  scheduledAt: new Date('2026-08-14T10:00:00Z').toISOString(),
  createdAt: Date.now(),
  ...over,
})

/** A hand-made task as it sits in storage, before anyone has linked it to a campaign. */
const manualTask = (over: Record<string, unknown> = {}) => ({
  id: 'task-1',
  text: 'Book the photographer',
  due: '2026-08-18',
  record: null,
  assignee: 'Ryan',
  done: false,
  createdAt: Date.now(),
  brand: BRAND,
  notes: '',
  ...over,
})

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  registerCampaign(CAMPAIGN, BRAND)
  registerCampaign(OTHER_CAMPAIGN, OTHER_BRAND)
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useTrafficStore.setState({ rows: [row()], clientFilter: BRAND })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  localStorage.clear()
  useTrafficStore.setState({ rows: [], clientFilter: 'all' })
})

const stored = () => JSON.parse(localStorage.getItem(KEY) ?? '[]') as { id: string; campaign?: string }[]
/** The task rows on screen, excluding the column header (which shares the .task-grid class). */
const rows = () => [...host.querySelectorAll('.task-grid.task-row')]
const cells = (el: Element) => [...el.querySelectorAll('.task-cell')]
const rowNamed = (text: string) => rows().find((r) => r.textContent?.includes(text))

describe('TasksView', () => {
  it('links a hand-made task to a campaign, and keeps the link in storage', () => {
    localStorage.setItem(KEY, JSON.stringify([manualTask()]))
    act(() => root.render(<TasksView />))

    // The campaign cell starts empty, and opens the picker.
    const campaignCell = cells(rowNamed('Book the photographer')!)[2]
    act(() => {
      campaignCell.querySelector('.task-chip-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const pick = [...host.querySelectorAll('.task-pick-item')].find((b) => b.textContent?.includes('Fall Launch'))
    expect(pick, 'the brand’s campaigns are offered').toBeTruthy()

    act(() => {
      pick!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(stored().find((t) => t.id === 'task-1')?.campaign).toBe(CAMPAIGN)
  })

  it('keeps a manual task’s campaign across a reload', () => {
    localStorage.setItem(KEY, JSON.stringify([manualTask({ campaign: CAMPAIGN })]))
    act(() => root.render(<TasksView />))

    // Rendering rewrites storage, so a link that survives the read/write round trip is one a
    // reload will still find.
    expect(stored().find((t) => t.id === 'task-1')?.campaign).toBe(CAMPAIGN)
    expect(cells(rowNamed('Book the photographer')!)[2].textContent).toContain('Fall Launch')
  })

  it('puts every row’s campaign under the campaign header, whatever kind of task it is', () => {
    localStorage.setItem(KEY, JSON.stringify([manualTask({ campaign: CAMPAIGN })]))
    act(() => root.render(<TasksView />))

    const headers = cells(host.querySelector('.task-colhead')!).map((c) => c.textContent)
    expect(headers).toEqual(['Task', 'Due date', 'Campaign', 'Record', 'Assigned to'])

    // The derived asset-task (from the seeded row) and the manual one agree on the grid.
    const derived = rowNamed('Teaser post')!
    const manual = rowNamed('Book the photographer')!
    expect(cells(derived)).toHaveLength(headers.length)
    expect(cells(manual)).toHaveLength(headers.length)
    expect(cells(derived)[2].textContent).toContain('Fall Launch')
  })

  /**
   * WITH NO BRAND PICKED THE LIST IS EVERY BRAND'S, NOT NOBODY'S. The rail only lands on a brand
   * when Brand records exist, so a workspace whose campaigns carry brand folders but no Brand card
   * leaves the filter on 'all' — which used to empty the page: thirty-odd assets across five
   * campaigns rendered as no tasks at all, on a page whose whole job is to list them.
   */
  it('lists every brand’s work when no brand is picked', () => {
    useTrafficStore.setState({
      rows: [row(), row({ id: 'row-2', assetName: 'Spring teaser', campaign: OTHER_CAMPAIGN })],
      clientFilter: 'all',
    })
    localStorage.setItem(KEY, JSON.stringify([manualTask({ campaign: CAMPAIGN })]))
    act(() => root.render(<TasksView />))

    expect(rowNamed('Teaser post'), 'the first brand’s asset').toBeTruthy()
    expect(rowNamed('Spring teaser'), 'the second brand’s asset').toBeTruthy()
    // The brand-tagged manual task is shown too, rather than filtered out by a brand nobody picked.
    expect(rowNamed('Book the photographer')).toBeTruthy()
  })

  it('still scopes to one brand once a brand is picked', () => {
    useTrafficStore.setState({
      rows: [row(), row({ id: 'row-2', assetName: 'Spring teaser', campaign: OTHER_CAMPAIGN })],
      clientFilter: BRAND,
    })
    act(() => root.render(<TasksView />))

    expect(rowNamed('Teaser post')).toBeTruthy()
    expect(rowNamed('Spring teaser'), 'the other brand’s asset stays out').toBeFalsy()
  })

  it('regroups by campaign, gathering each campaign’s tasks under its own head', () => {
    useTrafficStore.setState({
      rows: [row(), row({ id: 'row-2', assetName: 'Spring teaser', campaign: OTHER_CAMPAIGN })],
      clientFilter: 'all',
    })
    // One task on a campaign, one on none — the second proves the unlinked bucket exists.
    localStorage.setItem(KEY, JSON.stringify([manualTask({ campaign: CAMPAIGN }), manualTask({ id: 'task-2', text: 'Unfiled errand' })]))
    act(() => root.render(<TasksView />))

    const heads = () => [...host.querySelectorAll('.task-group-head')].map((h) => h.firstChild?.textContent?.trim())
    // Every heading is a due-date bucket until the control is touched (which bucket depends on
    // where the fixture's dates fall relative to the day the suite runs).
    expect(heads().every((h) => ['Overdue', 'Today', 'Upcoming', 'No date'].includes(h!))).toBe(true)

    const campaignBtn = [...host.querySelectorAll('.tasks-groupby-btn')].find((b) => b.textContent === 'Campaign')
    act(() => {
      campaignBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Campaigns alphabetically, with whatever has no campaign last rather than sorted among them.
    // Each heading drops its own brand prefix, so an unscoped list is not "Acme — Acme Fall Launch".
    expect(heads()).toEqual(['Fall Launch', 'Spring Push', 'No campaign'])
  })
})
