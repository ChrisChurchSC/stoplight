// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ObjectCardPicker } from '../ObjectCardPicker'

/**
 * What is worth testing here is the DISMISSAL, not the list.
 *
 * The obvious implementation of "click away to close" is a fixed-position scrim, and on this canvas
 * it silently does not work: every card carries an inline transform, so a fixed child is contained
 * by the card and covers about two hundred pixels of a board the size of the screen. That failure
 * looks like nothing — the menu just stays open — and no typecheck or build can see it.
 *
 * So these cover the three ways it closes and, for the board press, the thing that made the scrim
 * worth wanting in the first place: the press that dismisses the list must not also reach the card
 * underneath and start dragging it.
 */

let host: HTMLDivElement
let root: Root
let stack: HTMLDivElement

const OPTIONS = [
  { id: 'a', label: 'The quiet Friday', detail: 'Payroll day stops being the day nobody books a meeting.' },
  { id: 'b', label: 'Open loop' },
]

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  // The board. A press inside this is a press on the canvas; a press outside it is the toolbar or
  // the inspector, which the picker deliberately treats differently.
  stack = document.createElement('div')
  stack.className = 'flow-stack'
  document.body.appendChild(stack)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  stack.remove()
})

function mount(over: Partial<Parameters<typeof ObjectCardPicker>[0]> = {}) {
  const calls = { picked: [] as string[], created: 0, opened: 0 }
  act(() => {
    root.render(
      <ObjectCardPicker
        options={OPTIONS}
        name=""
        noun="concept"
        article="a"
        plural="concepts"
        tone="#ff8c42"
        emptyNote="No concepts yet."
        canCreate
        onPick={(id) => calls.picked.push(id)}
        onCreate={() => { calls.created += 1 }}
        onOpen={() => { calls.opened += 1 }}
        {...over}
      />,
    )
  })
  return calls
}

const face = () => host.querySelector('.flow-pick-face') as HTMLButtonElement
const menu = () => host.querySelector('.flow-pick-menu')
const openMenu = () => act(() => { face().click() })

/** A press the way a mouse makes one, so the capture-phase listener sees a real target. */
function press(target: Element): MouseEvent {
  const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  act(() => { target.dispatchEvent(e) })
  return e
}

describe('ObjectCardPicker', () => {
  it('shows the picked record and its line, so the card needs no name field of its own', () => {
    mount({ refId: 'a', name: 'The quiet Friday', detail: OPTIONS[0].detail })
    expect(face().textContent).toContain('The quiet Friday')
    expect(face().textContent).toContain('Payroll day stops being the day nobody books a meeting.')
  })

  it('says a card with nothing behind it is contributing nothing', () => {
    mount()
    expect(face().textContent).toContain('Nothing picked yet')
    expect(face().textContent).toContain('Contributes nothing yet')
  })

  it('selects its card when the list opens, since the canvas can no longer see the click', () => {
    const calls = mount()
    openMenu()
    expect(calls.opened).toBe(1)
  })

  it('picks a record and closes', () => {
    const calls = mount()
    openMenu()
    act(() => { (host.querySelectorAll('.flow-pick-opt')[1] as HTMLButtonElement).click() })
    expect(calls.picked).toEqual(['b'])
    expect(menu()).toBeNull()
  })

  it('offers to unlink only once there is something to unlink', () => {
    mount()
    openMenu()
    expect(host.querySelector('.flow-pick-act')?.textContent).not.toContain('Unlink')
    act(() => root.unmount())

    root = createRoot(host)
    const calls = mount({ refId: 'a', name: 'The quiet Friday' })
    openMenu()
    const unlink = [...host.querySelectorAll('.flow-pick-act')].find((b) => b.textContent?.includes('Unlink'))
    act(() => { (unlink as HTMLButtonElement).click() })
    expect(calls.picked).toEqual([''])
  })

  it('closes on a press elsewhere on the board, and does not let that press reach the card under it', () => {
    mount()
    openMenu()
    expect(menu()).not.toBeNull()
    const e = press(stack)
    expect(menu()).toBeNull()
    // Swallowed. Otherwise dismissing the list starts dragging whatever card it was over.
    expect(e.defaultPrevented).toBe(true)
  })

  it('closes on a press off the board, and lets that one through', () => {
    mount()
    openMenu()
    const e = press(document.body)
    expect(menu()).toBeNull()
    // The toolbar and the inspector are deliberate destinations; reaching them must not take two clicks.
    expect(e.defaultPrevented).toBe(false)
  })

  it('stays open for a press inside itself', () => {
    mount()
    openMenu()
    press(menu() as Element)
    expect(menu()).not.toBeNull()
  })

  it('closes on Escape without letting the canvas also act on it', () => {
    mount()
    openMenu()
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    const onCanvas = vi.fn()
    document.addEventListener('keydown', onCanvas)
    act(() => { document.body.dispatchEvent(e) })
    document.removeEventListener('keydown', onCanvas)
    expect(menu()).toBeNull()
    expect(onCanvas).not.toHaveBeenCalled()
  })

  it('filters a long library and says so when nothing matches', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, label: `Concept ${i}`, detail: `Idea ${i}` }))
    mount({ options: many })
    openMenu()
    const search = host.querySelector('.flow-pick-search') as HTMLInputElement
    expect(search).not.toBeNull()

    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      set.call(search, 'Concept 3')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelectorAll('.flow-pick-opt')).toHaveLength(1)

    act(() => {
      set.call(search, 'nothing like this')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelectorAll('.flow-pick-opt')).toHaveLength(0)
    expect(host.querySelector('.flow-pick-note')?.textContent).toContain('No concepts match')
  })

  it('does not offer a search box for a library you can read at a glance', () => {
    mount()
    openMenu()
    expect(host.querySelector('.flow-pick-search')).toBeNull()
  })

  it('offers to make one when the library is empty, rather than only reporting that it is', () => {
    const calls = mount({ options: [] })
    openMenu()
    expect(host.querySelector('.flow-pick-note')?.textContent).toContain('No concepts yet.')
    act(() => { (host.querySelector('.flow-pick-new') as HTMLButtonElement).click() })
    expect(calls.created).toBe(1)
  })
})
