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
/** Group by a column the way the page does: click its header. Clicking again stops. */
const groupByColumn = (label: string) => {
  act(() => {
    ;[...host.querySelectorAll('.task-colhead-btn')]
      .find((b) => b.querySelector('.task-colhead-label')?.textContent === label)!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}
/** Whether a column header is showing itself as the current grouping. */
const headerGrouped = (label: string) =>
  [...host.querySelectorAll('.task-colhead-cell')].some(
    (c) => c.querySelector('.task-colhead-label')?.textContent === label && c.className.includes('grouped'),
  )
/**
 * A row's cell UNDER A NAMED COLUMN. Indexing by position meant every test broke the day a column
 * was inserted, which is the same brittleness the grid itself has — and there it is a bug, so a
 * test that shares it is a test that will be "fixed" by renumbering rather than read.
 */
const cellUnder = (rowEl: Element, label: string) => cells(rowEl)[headerLabels().indexOf(label)]
/** The column labels, in header order. */
const headerLabels = () =>
  cells(host.querySelector('.task-colhead')!).map((c) => c.querySelector('.task-colhead-label')?.textContent ?? c.textContent)

describe('TasksView', () => {
  it('links a hand-made task to a campaign, and keeps the link in storage', () => {
    localStorage.setItem(KEY, JSON.stringify([manualTask()]))
    act(() => root.render(<TasksView />))

    // The campaign cell starts empty, and opens the picker.
    const campaignCell = cellUnder(rowNamed('Book the photographer')!, 'Campaign')
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
    expect(cellUnder(rowNamed('Book the photographer')!, 'Campaign').textContent).toContain('Fall Launch')
  })

  it('puts every row’s campaign under the campaign header, whatever kind of task it is', () => {
    localStorage.setItem(KEY, JSON.stringify([manualTask({ campaign: CAMPAIGN })]))
    act(() => root.render(<TasksView />))

    const headers = headerLabels()
    // The first column carries no label: every row is a task, so "Task" named the table rather
    // than the column, and it was the only header here that is not a grouping control.
    expect(headers).toEqual(['', 'Due date', 'Folder', 'Campaign', 'Assigned to'])

    // The derived asset-task (from the seeded row) and the manual one agree on the grid.
    const derived = rowNamed('Teaser post')!
    const manual = rowNamed('Book the photographer')!
    expect(cells(derived)).toHaveLength(headers.length)
    expect(cells(manual)).toHaveLength(headers.length)
    expect(cellUnder(derived, 'Campaign').textContent).toContain('Fall Launch')
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

  /**
   * A DERIVED TASK IS WORK SOMEONE DOES, SO IT TAKES AN OWNER. Assets arrived as the read-only kind
   * of task, which left "Assigned to" empty down a page where every row was one — a task list on
   * which nothing could be owned. The owner is kept per-asset, beside `done`, rather than on the
   * row: the row belongs to the flow, and who is writing the post is not a fact about the post.
   */
  it('assigns an owner to an asset-task, and keeps it', () => {
    act(() => root.render(<TasksView />))

    const input = cellUnder(rowNamed('Teaser post')!, 'Assigned to').querySelector('input')
    expect(input, 'the derived row has an assignee field like any other').toBeTruthy()

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'Ryan')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // Typing alone does not commit — the suggestions are open over a half-typed name. Leaving the
    // field is what writes it, which is also what lets a name nobody has used yet be typed at all.
    act(() => {
      input!.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })

    const stored = JSON.parse(localStorage.getItem('stoplight.assetTaskAssignee.v1') ?? '{}')
    expect(stored['row-1']).toBe('Ryan')
  })

  it('suggests a name already in use, and renaming it reaches every task holding it', () => {
    // Two assets, one of them already assigned — so there is a name to suggest and a name to fix.
    useTrafficStore.setState({
      rows: [row(), row({ id: 'row-2', assetName: 'Second post' })],
      clientFilter: BRAND,
    })
    localStorage.setItem('stoplight.assetTaskAssignee.v1', JSON.stringify({ 'row-1': 'Ryna' }))
    localStorage.setItem(KEY, JSON.stringify([manualTask({ assignee: 'Ryna' })]))
    act(() => root.render(<TasksView />))

    // The unassigned row offers the name the workspace is already using.
    const input = cellUnder(rowNamed('Second post')!, 'Assigned to').querySelector('input')!
    act(() => input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })))
    const suggestion = [...host.querySelectorAll('.task-pick-item')].find((b) => b.textContent?.includes('Ryna'))
    expect(suggestion, 'a name in use is offered rather than retyped').toBeTruthy()

    // Correcting the spelling from the toolbar has to reach the asset AND the manual task.
    act(() => {
      host.querySelector<HTMLElement>('.tasks-filter-btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      ;[...host.querySelectorAll('.tasks-filter-act')]
        .find((b) => b.getAttribute('title')?.startsWith('Rename'))!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const edit = host.querySelector<HTMLInputElement>('.tasks-filter-edit input')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(edit, 'Ryan')
      edit.dispatchEvent(new Event('input', { bubbles: true }))
      edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(JSON.parse(localStorage.getItem('stoplight.assetTaskAssignee.v1')!)['row-1']).toBe('Ryan')
    expect(JSON.parse(localStorage.getItem(KEY)!)[0].assignee).toBe('Ryan')
  })

  it('narrows to one channel, and leaves hand-made tasks out of that question', () => {
    useTrafficStore.setState({
      rows: [row(), row({ id: 'row-2', assetName: 'Launch page', channel: 'landing-page' })],
      clientFilter: BRAND,
    })
    // A hand-made task is not a post, so it has no channel to be filtered on.
    localStorage.setItem(KEY, JSON.stringify([manualTask()]))
    act(() => root.render(<TasksView />))
    expect(rows()).toHaveLength(3)

    const channelBtn = [...host.querySelectorAll('.tasks-filter-btn')].find((b) => b.textContent?.includes('All work'))
    expect(channelBtn, 'the kinds of work on the board are offered').toBeTruthy()
    act(() => channelBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    act(() => {
      ;[...host.querySelectorAll('.task-pick-item')]
        .find((b) => b.textContent === 'Instagram')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(rowNamed('Teaser post'), 'the Instagram asset').toBeTruthy()
    expect(rowNamed('Launch page'), 'the landing page is another channel').toBeFalsy()
    expect(rowNamed('Book the photographer'), 'and a task with no channel is not on one').toBeFalsy()
  })

  /**
   * A hand-made task is not a post and belongs to no channel, so a channel filter used to be the
   * one question it could never answer — findable only by clearing every filter, which on a board
   * of thirty posts is not findable. It is its own kind of work, so it has its own entry.
   */
  it('collects the hand-made tasks under an entry of their own', () => {
    useTrafficStore.setState({ rows: [row()], clientFilter: BRAND })
    localStorage.setItem(KEY, JSON.stringify([manualTask()]))
    act(() => root.render(<TasksView />))

    const open = () => {
      const btn = [...host.querySelectorAll('.tasks-filter-btn')].find(
        (b) => b.textContent?.includes('All work') || b.textContent?.includes('Custom tasks'),
      )
      act(() => btn!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    }
    open()
    const entry = [...host.querySelectorAll('.task-pick-item')].find((b) => b.textContent === 'Custom tasks')
    expect(entry, 'the entry is offered because there is a hand-made task').toBeTruthy()

    act(() => entry!.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(rowNamed('Book the photographer'), 'the hand-made one').toBeTruthy()
    expect(rowNamed('Teaser post'), 'and none of the posts').toBeFalsy()
  })

  it('does not offer the entry when nothing is hand-made', () => {
    useTrafficStore.setState({ rows: [row()], clientFilter: BRAND })
    act(() => root.render(<TasksView />))

    const btn = [...host.querySelectorAll('.tasks-filter-btn')].find((b) => b.textContent?.includes('All work'))
    act(() => btn!.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    const labels = [...host.querySelectorAll('.task-pick-item')].map((b) => b.textContent)
    expect(labels).not.toContain('Custom tasks')
  })

  /**
   * THE ROW'S ✕ REACHES ONE ROW. The Assignee menu has the same pair and they act on the person
   * across every task; here they must not, because an ✕ beside a name in a cell reads as "take
   * them off this" and quietly unassigning them from ten other tasks is not something a row should
   * be able to do by accident.
   */
  it('unassigns only the row it was clicked on', () => {
    useTrafficStore.setState({
      rows: [row(), row({ id: 'row-2', assetName: 'Second post' })],
      clientFilter: BRAND,
    })
    localStorage.setItem('stoplight.assetTaskAssignee.v1', JSON.stringify({ 'row-1': 'Ryan', 'row-2': 'Ryan' }))
    act(() => root.render(<TasksView />))

    const clear = cellUnder(rowNamed('Teaser post')!, 'Assigned to').querySelector('.task-assignee-acts .tasks-filter-act:last-child')
    expect(clear, 'the row carries the same actions as the menu').toBeTruthy()
    act(() => clear!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))

    const stored = JSON.parse(localStorage.getItem('stoplight.assetTaskAssignee.v1')!)
    expect(stored['row-1'], 'the row that was clicked').toBeUndefined()
    expect(stored['row-2'], 'and not the other one Ryan is on').toBe('Ryan')
  })

  /**
   * THE MENU'S ✕ ASKS FIRST. It reaches every task the person holds, and it is one small glyph
   * away from the row's ✕, which reaches one — the same shape doing something an order of
   * magnitude larger. A single click is not enough authority for that.
   */
  it('asks before taking someone off every task, and does nothing if you decline', () => {
    useTrafficStore.setState({
      rows: [row(), row({ id: 'row-2', assetName: 'Second post' })],
      clientFilter: BRAND,
    })
    localStorage.setItem('stoplight.assetTaskAssignee.v1', JSON.stringify({ 'row-1': 'Ryan', 'row-2': 'Ryan' }))
    act(() => root.render(<TasksView />))

    const openMenu = () =>
      act(() => host.querySelector<HTMLElement>('.tasks-filter-btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const pressX = () =>
      act(() => {
        ;[...host.querySelectorAll('.tasks-filter-act')]
          .find((b) => b.getAttribute('title')?.includes('every task'))!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

    openMenu()
    pressX()

    // Armed, not done: it says what it is about to do, and how much of it.
    expect(host.querySelector('.tasks-filter-confirm-text')?.textContent).toContain('Take Ryan off 2 tasks?')
    expect(JSON.parse(localStorage.getItem('stoplight.assetTaskAssignee.v1')!)['row-1'], 'nothing yet').toBe('Ryan')

    act(() => host.querySelector<HTMLElement>('.tasks-filter-confirm-no')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(JSON.parse(localStorage.getItem('stoplight.assetTaskAssignee.v1')!)['row-1'], 'declining leaves it alone').toBe('Ryan')

    pressX()
    act(() => host.querySelector<HTMLElement>('.tasks-filter-confirm-yes')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    const after = JSON.parse(localStorage.getItem('stoplight.assetTaskAssignee.v1')!)
    expect(after['row-1'], 'and confirming takes them off both').toBeUndefined()
    expect(after['row-2']).toBeUndefined()
  })

  /**
   * A FILTER THAT MATCHES NOTHING HAS TO SAY SO. Matching nothing is an ordinary thing for a filter
   * to do; it rendered as column headers over a blank page, under a header still claiming
   * thirty-one open — which is indistinguishable from the page having broken.
   */
  it('says so when the filters match nothing, and counts what is on screen', () => {
    useTrafficStore.setState({ rows: [row()], clientFilter: BRAND })
    localStorage.setItem('stoplight.assetTaskAssignee.v1', JSON.stringify({ 'row-1': 'Ryan' }))
    act(() => root.render(<TasksView />))
    expect(host.querySelector('.mtx-sub')?.textContent).toContain('1 open')

    // Filter to somebody with nothing.
    act(() => host.querySelector<HTMLElement>('.tasks-filter-btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    act(() => {
      ;[...host.querySelectorAll('.task-pick-item')]
        .find((b) => b.textContent?.includes('Unassigned'))!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(rows(), 'nothing matches').toHaveLength(0)
    expect(host.querySelector('.mtx-empty')?.textContent, 'and it says why rather than going blank').toContain(
      'Nothing matches these filters',
    )
    // The count is about what you can see, with the whole named as the thing being sliced.
    expect(host.querySelector('.mtx-sub')?.textContent).toContain('0 of 1 open')
  })

  /**
   * THE FOLDER IS WHAT SAYS WHOSE WORK IT IS WHEN THE NAME DOES NOT.
   *
   * campaignStoredName only prefixes a campaign with a brand when it HAS one, so a campaign made
   * without a brand keeps whatever was typed: "Rebrand Launch" filed under Arbitrum carries nothing
   * at all saying Arbitrum, and its rows read the same as anyone's. The folder is the thing the
   * person filing it actually chose, and the only reliable answer for those campaigns.
   */
  it('shows the folder a campaign is filed under, even when its name says nothing', () => {
    const PLAIN = 'Rebrand Launch' // no brand prefix — exactly the case the name cannot answer
    useTrafficStore.setState({
      rows: [row({ id: 'row-p', assetName: 'Teaser post', campaign: PLAIN })],
      campaignList: [{ name: PLAIN, client: 'Drafts', strategy: 'Current state', folder: 'Arbitrum' }],
      clientFilter: 'all',
    })
    act(() => root.render(<TasksView />))

    expect(cellUnder(rowNamed('Teaser post')!, 'Campaign').textContent, 'the name alone is ambiguous').toContain(PLAIN)
    expect(cellUnder(rowNamed('Teaser post')!, 'Folder').textContent, 'the folder resolves it').toBe('Arbitrum')
  })

  it('reads a nested folder as its whole path, and an unfiled campaign as Drafts', () => {
    useTrafficStore.setState({
      rows: [
        row({ id: 'row-n', assetName: 'Nested post', campaign: 'Deep one' }),
        row({ id: 'row-u', assetName: 'Unfiled post', campaign: 'Loose one' }),
      ],
      campaignList: [
        { name: 'Deep one', client: 'Drafts', strategy: 'Current state', folder: 'Arbitrum/Q3' },
        { name: 'Loose one', client: 'Drafts', strategy: 'Current state' },
      ],
      clientFilter: 'all',
    })
    act(() => root.render(<TasksView />))

    // Whole path: the top segment is usually the brand, and dropping it loses what the column is for.
    expect(cellUnder(rowNamed('Nested post')!, 'Folder').textContent).toBe('Arbitrum / Q3')
    expect(cellUnder(rowNamed('Unfiled post')!, 'Folder').textContent, 'the no-folder bucket has a name').toBe('Drafts')
  })

  /**
   * THE CAMPAIGN FILTER OFFERS BOTH LEVELS. A flat list of campaigns stops being scannable at five
   * or six per client; folders alone would drop single-campaign filtering, which gets MORE useful
   * as the count grows. Picking a folder takes everything filed under it, picking a campaign takes
   * one, and the two are different namespaces — hence the prefix on the folder's value.
   */
  it('filters by a whole folder, or by one campaign inside it', () => {
    useTrafficStore.setState({
      rows: [
        row({ id: 'row-a', assetName: 'A post', campaign: 'One' }),
        row({ id: 'row-b', assetName: 'B post', campaign: 'Two' }),
        row({ id: 'row-c', assetName: 'C post', campaign: 'Three' }),
      ],
      campaignList: [
        { name: 'One', client: 'Drafts', strategy: 'Current state', folder: 'Arbitrum' },
        { name: 'Two', client: 'Drafts', strategy: 'Current state', folder: 'Arbitrum' },
        { name: 'Three', client: 'Drafts', strategy: 'Current state', folder: 'Oxyle' },
      ],
      clientFilter: 'all',
    })
    act(() => root.render(<TasksView />))

    const openMenu = () =>
      act(() =>
        [...host.querySelectorAll('.tasks-filter-btn')]
          .find((b) => b.textContent?.includes('campaign') || b.textContent?.includes('Arbitrum') || b.textContent?.includes('One'))!
          .dispatchEvent(new MouseEvent('click', { bubbles: true })),
      )
    const click = (sel: string, text: string) =>
      act(() =>
        [...host.querySelectorAll(sel)]
          .find((b) => b.textContent?.includes(text))!
          .dispatchEvent(new MouseEvent('click', { bubbles: true })),
      )

    // The folder row takes everything filed under it.
    openMenu()
    click('.tasks-filter-folder', 'Arbitrum')
    expect(rows()).toHaveLength(2)
    expect(rowNamed('C post'), 'the other folder stays out').toBeFalsy()

    // And the pill says the folder's name — the filter value carries a sentinel prefix, which read
    // straight through onto the button because only its leading NUL was invisible.
    const pill = [...host.querySelectorAll('.tasks-filter-btn')].map((b) => b.textContent ?? '')
    expect(pill.some((t) => t.includes('Arbitrum')), 'the pill names the folder').toBe(true)
    expect(pill.some((t) => t.includes('folder:')), 'and not the sentinel').toBe(false)

    // A campaign inside it takes just that one.
    openMenu()
    click('.tasks-filter-sub', 'Two')
    expect(rows()).toHaveLength(1)
    expect(rowNamed('B post')).toBeTruthy()
  })

  it('groups by folder from its header, like the other columns', () => {
    useTrafficStore.setState({
      rows: [
        row({ id: 'row-a', assetName: 'A post', campaign: 'One' }),
        row({ id: 'row-b', assetName: 'B post', campaign: 'Two' }),
      ],
      campaignList: [
        { name: 'One', client: 'Drafts', strategy: 'Current state', folder: 'Arbitrum' },
        { name: 'Two', client: 'Drafts', strategy: 'Current state', folder: 'Oxyle' },
      ],
      clientFilter: 'all',
    })
    act(() => root.render(<TasksView />))

    groupByColumn('Folder')
    expect(headerGrouped('Folder')).toBe(true)
    const heads = [...host.querySelectorAll('.task-group-head')].map((h) => h.firstChild?.textContent?.trim())
    expect(heads).toEqual(['Arbitrum', 'Oxyle'])
  })

  it('gives two owners two colours, where the shared hash gave them one', () => {
    useTrafficStore.setState({
      rows: [row(), row({ id: 'row-2', assetName: 'Second post' })],
      clientFilter: BRAND,
    })
    // The pair that prompted this: both sum into the same slot under recordTint.
    localStorage.setItem('stoplight.assetTaskAssignee.v1', JSON.stringify({ 'row-1': 'Laura', 'row-2': 'Ryan' }))
    act(() => root.render(<TasksView />))

    const tintOf = (name: string) =>
      cellUnder(rowNamed(name)!, 'Assigned to').querySelector<HTMLElement>('.task-avatar')!.style.background
    expect(tintOf('Teaser post')).toBeTruthy()
    expect(tintOf('Teaser post'), 'Laura and Ryan are told apart').not.toBe(tintOf('Second post'))
  })

  it('filters the list down to one person', () => {
    useTrafficStore.setState({
      rows: [row(), row({ id: 'row-2', assetName: 'Second post' })],
      clientFilter: BRAND,
    })
    localStorage.setItem('stoplight.assetTaskAssignee.v1', JSON.stringify({ 'row-1': 'Ryan' }))
    act(() => root.render(<TasksView />))
    expect(rows()).toHaveLength(2)

    act(() => {
      host.querySelector<HTMLElement>('.tasks-filter-btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      host.querySelector<HTMLElement>('.tasks-filter-pick')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(rows()).toHaveLength(1)
    expect(rowNamed('Teaser post'), 'the one assigned to them').toBeTruthy()
  })

  /**
   * THE CHANNEL IS A MARK, NOT A WORD, in the table. Spelled out it half-repeated the asset's own
   * name — "LinkedIn post · LinkedIn image post #1" — and rows whose names carried no channel were
   * left looking like a different column.
   *
   * `text` KEEPS the spelled-out form. HomeAgenda renders it with no icon beside it, so stripping
   * the channel there would drop the only thing saying what the asset is.
   */
  it('shows the channel as an icon and the asset’s own name', () => {
    useTrafficStore.setState({
      rows: [
        row({ id: 'row-lp', assetName: 'Landing page', channel: 'landing-page' }),
        row({ id: 'row-ig', assetName: 'Teaser post', channel: 'instagram' }),
      ],
      clientFilter: BRAND,
    })
    // Seeded before the only render: `tasks` is read once on mount, so a second root.render on the
    // same root would not pick it up.
    localStorage.setItem(KEY, JSON.stringify([manualTask()]))
    act(() => root.render(<TasksView />))

    const label = (t: string) => rowNamed(t)!.querySelector('.task-name-open')!.textContent
    expect(label('Teaser post'), 'the name alone, with no channel spelled in front').toBe('Teaser post')
    expect(rowNamed('Teaser post')!.querySelector('.task-channel'), 'and the channel as a mark').toBeTruthy()
    expect(label('Landing page'), 'including the one whose name IS its channel').toBe('Landing page')

    // A hand-made task is on no channel, so it carries no mark — the fixed-width slot is what keeps
    // its name on the same left edge as the rest.
    expect(rowNamed('Book the photographer')!.querySelector('.task-channel')).toBeFalsy()
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

    groupByColumn('Campaign')

    // Campaigns alphabetically, with whatever has no campaign last rather than sorted among them.
    // Each heading drops its own brand prefix, so an unscoped list is not "Acme — Acme Fall Launch".
    expect(heads()).toEqual(['Fall Launch', 'Spring Push', 'No campaign'])
  })
})
