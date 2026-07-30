// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BufferedTextarea } from '../BufferedTextarea'

/**
 * THE FIRST COMPONENT TEST IN THIS REPO, and it exists because of what it catches.
 *
 * BufferedTextarea shipped with a bug that a clean typecheck, 97 passing tests and a green
 * production build all missed, because none of them could render a component: blur only cleared the
 * pending save when the text had changed, so typing a character and deleting it again left a timer
 * armed on a field nobody was in, and half a second later it wrote the pre-edit text over whatever
 * had landed in between. In practice that meant pressing Generate right after an undo silently
 * reverted the draft.
 *
 * The environment pragma above is deliberate rather than a global config change: every other test
 * here runs in node, and moving the whole suite into jsdom would slow all of them to make room for
 * this one.
 *
 * ONE THING TO KNOW BEFORE ADDING TESTS HERE. React maps onBlur to the native `focusout` event, not
 * `blur`. Dispatching `blur` does nothing, and because "nothing" also means "the timer never got
 * cleared", a broken test looks exactly like a broken component. Use focusout.
 */

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

/** Render with a given stored value, collecting every commit the box asks for. */
function mount(value: string, commits: string[]) {
  act(() => {
    root.render(<BufferedTextarea value={value} onCommit={(v) => commits.push(v)} />)
  })
  return host.querySelector('textarea') as HTMLTextAreaElement
}

function reRender(value: string, commits: string[]) {
  act(() => {
    root.render(<BufferedTextarea value={value} onCommit={(v) => commits.push(v)} />)
  })
}

/** Type into a controlled textarea the way a person does, through React's own change path. */
function type(el: HTMLTextAreaElement, next: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, next)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Leave the field. React listens for focusout, so `blur` would be a silent no-op. */
function leave(el: HTMLTextAreaElement) {
  act(() => {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

describe('BufferedTextarea', () => {
  it('does not write on every keystroke', () => {
    const commits: string[] = []
    const el = mount('', commits)
    for (const s of ['H', 'He', 'Hel', 'Hell', 'Hello']) type(el, s)
    expect(commits).toEqual([])
    act(() => void vi.advanceTimersByTime(600))
    expect(commits).toEqual(['Hello'])
  })

  it('saves once the typing stops', () => {
    const commits: string[] = []
    const el = mount('old', commits)
    type(el, 'new text')
    act(() => void vi.advanceTimersByTime(600))
    expect(commits).toEqual(['new text'])
  })

  it('saves immediately on leaving the field, without waiting out the debounce', () => {
    const commits: string[] = []
    const el = mount('old', commits)
    type(el, 'edited')
    leave(el)
    expect(commits).toEqual(['edited'])
  })

  it('does not write when the text was never actually changed', () => {
    const commits: string[] = []
    const el = mount('unchanged', commits)
    leave(el)
    act(() => void vi.advanceTimersByTime(600))
    expect(commits).toEqual([])
  })

  /**
   * THE REGRESSION. Type a character, delete it again, leave the field, and let something else write
   * to the same row. Nothing may fire afterwards: a commit here is the pre-edit text landing on top
   * of a generation that completed in the meantime.
   */
  it('leaves no armed timer after an edit that was undone before blur', () => {
    const commits: string[] = []
    const el = mount('Old body', commits)
    type(el, 'Old body x')
    type(el, 'Old body')
    leave(el)
    // A generation lands inside what used to be the pending window.
    reRender('Drafted line', commits)
    act(() => void vi.advanceTimersByTime(1000))
    expect(commits).toEqual([])
  })

  it('shows a value that arrived from elsewhere while the box sat idle', () => {
    const commits: string[] = []
    const el = mount('before', commits)
    expect(el.value).toBe('before')
    reRender('arrived from a generation', commits)
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('arrived from a generation')
  })

  it('does not fire a pending save after the field is unmounted', () => {
    const commits: string[] = []
    const el = mount('old', commits)
    type(el, 'half typed')
    act(() => root.render(<div />))
    act(() => void vi.advanceTimersByTime(1000))
    expect(commits).toEqual([])
  })
})
