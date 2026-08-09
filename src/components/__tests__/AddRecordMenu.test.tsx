// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AddRecordMenu, ADD_SEARCH_FROM } from '../AddRecordMenu'

/**
 * THE STEP BETWEEN CHOOSING A KIND AND THE CARD LANDING.
 *
 * This list used to hang off the card's own face, where most of what its file contained was the
 * fight with the canvas underneath it — a capture-phase dismisser, because a fixed-position scrim is
 * contained by a transformed card rather than the viewport, and a press that closed the menu would
 * otherwise start dragging the card it landed on. On the toolbar none of that applies, so what is
 * left worth pinning is the list's own behaviour: that a record picked here is the record the card
 * gets, that the filter only appears when it earns its line, and that the two dead ends (an empty
 * library, a filter matching nothing) say which one they are.
 */

let host: HTMLDivElement
let root: Root

const OPTIONS = [
  { id: 'a', label: 'Saltwater charter captains', detail: 'Charter captain or professional fishing guide' },
  { id: 'b', label: 'Trip-planning weekend anglers', detail: 'Weekend angler or leisure fisherman' },
  { id: 'c', label: 'Great Lakes and freshwater specialists' },
]

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function mount(over: Partial<Parameters<typeof AddRecordMenu>[0]> = {}) {
  const calls = { picked: [] as string[], created: 0, closed: 0, queried: [] as string[] }
  act(() => {
    root.render(
      <AddRecordMenu
        options={OPTIONS}
        noun="audience"
        plural="audiences"
        emptyNote="No audiences yet. Make one below and it joins the library."
        canCreate
        query=""
        onQuery={(q) => calls.queried.push(q)}
        onPick={(id) => calls.picked.push(id)}
        onCreate={() => { calls.created++ }}
        onClose={() => { calls.closed++ }}
        {...over}
      />,
    )
  })
  return calls
}

const opts = () => [...host.querySelectorAll('.flow-pick-opt')] as HTMLElement[]
const note = () => host.querySelector('.flow-pick-note')?.textContent ?? ''

describe('AddRecordMenu', () => {
  it('hands back the record that was pressed, which is the record the card gets', () => {
    const calls = mount()
    expect(opts().map((b) => b.querySelector('.flow-pick-opt-name')?.textContent)).toEqual([
      'Saltwater charter captains',
      'Trip-planning weekend anglers',
      'Great Lakes and freshwater specialists',
    ])
    act(() => { opts()[1].click() })
    expect(calls.picked).toEqual(['b'])
  })

  /**
   * NOTHING IS THE CURRENT CHOICE, because there is no card yet. The list this replaced marked the
   * linked record with a tick and offered to unlink it; both were answers to "change what this card
   * points at", which is not the question being asked here.
   */
  it('marks nothing as selected and offers nothing to unlink', () => {
    mount()
    expect(opts().every((b) => b.getAttribute('aria-selected') === 'false')).toBe(true)
    expect(host.querySelector('.flow-pick-tick')).toBeNull()
    expect(host.textContent).not.toMatch(/unlink/i)
  })

  it('shows the record’s own line under its name, which is the reason to read the list at all', () => {
    mount()
    expect(opts()[0].querySelector('.flow-pick-opt-sub')?.textContent).toBe('Charter captain or professional fishing guide')
    // A kind whose records carry no one-liner does not get an empty element hanging off the row.
    expect(opts()[2].querySelector('.flow-pick-opt-sub')).toBeNull()
  })

  it('only spends a line on the filter once scanning beats reading', () => {
    mount()
    expect(host.querySelector('.flow-pick-search')).toBeNull()
    const many = Array.from({ length: ADD_SEARCH_FROM }, (_, i) => ({ id: `x${i}`, label: `Audience ${i}` }))
    act(() => { root.render(<div />) })
    const calls = mount({ options: many })
    const search = host.querySelector('.flow-pick-search') as HTMLInputElement
    expect(search).not.toBeNull()
    expect(search.placeholder).toBe('Search audiences…')
    expect(calls.queried).toEqual([])
  })

  /** "guide" appears in no name here, only in a detail line — which is half of what you search for. */
  it('filters on the record’s line as well as its name', () => {
    mount({ query: 'guide' })
    expect(opts().map((b) => b.querySelector('.flow-pick-opt-name')?.textContent)).toEqual(['Saltwater charter captains'])
  })

  /** An empty library and a filter that matched nothing are different problems with different fixes. */
  it('tells an empty library apart from a filter that matched nothing', () => {
    mount({ options: [] })
    expect(note()).toBe('No audiences yet. Make one below and it joins the library.')
    act(() => { root.render(<div />) })
    mount({ query: 'kayak' })
    expect(note()).toBe('No audiences match “kayak”.')
  })

  it('offers to make one, and does not when the kind cannot be made here', () => {
    const calls = mount()
    const make = host.querySelector('.flow-pick-new') as HTMLElement
    expect(make.textContent).toBe('+ New audience…')
    act(() => { make.click() })
    expect(calls.created).toBe(1)
    act(() => { root.render(<div />) })
    mount({ canCreate: false })
    expect(host.querySelector('.flow-pick-new')).toBeNull()
  })

  it('closes on a press outside it', () => {
    const calls = mount()
    const scrim = host.querySelector('.flow-tb-palscrim') as HTMLElement
    act(() => { scrim.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(calls.closed).toBe(1)
  })
})
