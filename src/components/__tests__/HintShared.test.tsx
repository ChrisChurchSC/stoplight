// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Hint } from '../Hint'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * A HINT TEACHES YOU TO BUILD. A SHARE LINK HANDS YOU SOMETHING ALREADY BUILT.
 *
 * The hints explain how to make the thing on screen — add a Brand card, say who the brand is, name
 * what you are launching, branch a card into next steps — and several run in sequence with a Next
 * button that advances a tutorial. All of that is written for the person whose workspace it is.
 *
 * Sent to a share recipient it becomes instructions for a campaign they did not make, cannot
 * change, and are only visiting: a to-do list over somebody else's finished work, pointing at
 * controls the shared view does not give them. The first thing an outsider sees should be the work.
 *
 * Tested at the component rather than the eight call sites, because that is where the rule lives —
 * a hint added later inherits it without anyone remembering to.
 */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

const render = (ui: React.ReactElement) => {
  act(() => {
    root.render(ui)
  })
}

const hint = (
  <Hint show storageKey="stoplight.test.hint.shared" title="Start a campaign" body={['A campaign opens a canvas.']} />
)

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  localStorage.clear()
  useTrafficStore.setState({ sharedSession: null })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
  useTrafficStore.setState({ sharedSession: null })
})

describe('Hint in a shared session', () => {
  it('shows in the owner’s own workspace', () => {
    render(hint)
    expect(host.textContent).toContain('Start a campaign')
  })

  it('shows nothing to someone who opened a share link', () => {
    act(() => {
      useTrafficStore.setState({
        sharedSession: { client: 'Acme', role: 'stakeholder', grantId: 'shr_test' },
      })
    })
    render(hint)
    expect(host.textContent).toBe('')
  })

  /** A single-flow share is the narrowest view there is, and the least appropriate place to teach. */
  it('shows nothing on a link scoped to one campaign', () => {
    act(() => {
      useTrafficStore.setState({
        sharedSession: { client: 'Acme', role: 'editor', grantId: 'shr_test', campaign: 'ABM FW 2026' },
      })
    })
    render(hint)
    expect(host.textContent).toBe('')
  })

  /**
   * Dismissal is per-key in localStorage. A share viewer never sees the card, so they can never
   * dismiss it — and must not silently spend the owner's dismissal on a browser they share.
   */
  it('does not mark the hint seen for a share viewer', () => {
    act(() => {
      useTrafficStore.setState({
        sharedSession: { client: 'Acme', role: 'stakeholder', grantId: 'shr_test' },
      })
    })
    render(hint)
    expect(localStorage.getItem('stoplight.test.hint.shared')).toBeNull()
  })
})
