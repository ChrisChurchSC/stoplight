// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FlowSteps } from '../FlowSteps'
import { SaveBanner } from '../SaveBanner'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * THE REST OF THE OWNER'S CHROME, ON A VISITOR'S SCREEN.
 *
 * Hint.tsx was gated for a share viewer and the teaching still showed, because the cards are only
 * half of it. FlowSteps is the corner counter the cards belong to — "Setting up, 2 of 7", a list of
 * seven things to go and do — and it renders from the board, not from a hint, so it sailed through
 * untouched. A recipient got a progress bar through work they have no controls to do.
 *
 * SaveBanner is the same mistake in a more alarming register. A share view runs on localStorage by
 * design and has no workspace to write to, which is exactly the condition the banner shouts about:
 * it told a visitor their changes were not reaching their account, across the top of a read-only
 * copy of a campaign they cannot change, above a Retry button with nothing to retry.
 */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../adapters/state/workspaceState', () => ({
  // Trouble from the first render, which is what a share viewer hit: no workspace is signed in.
  onSaveTrouble: (cb: (t: unknown) => void) => {
    cb({ reason: 'no-workspace' })
    return () => {}
  },
  retryPersistedState: async () => {},
}))

const STEPS = [
  { id: 'addBrand', label: 'Add a Brand card' },
  { id: 'fillBrand', label: 'Say who the brand is' },
]

let host: HTMLDivElement
let root: Root

const render = (ui: React.ReactElement) => {
  act(() => {
    root.render(ui)
  })
}

const asShareViewer = () => {
  act(() => {
    useTrafficStore.setState({
      sharedSession: { client: 'World Within', role: 'stakeholder', grantId: 'shr_test', campaign: 'ABM FW 2026' },
    })
  })
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useTrafficStore.setState({ sharedSession: null })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
  useTrafficStore.setState({ sharedSession: null })
})

describe('FlowSteps in a shared session', () => {
  it('counts the setup steps in the owner’s own workspace', () => {
    render(<FlowSteps steps={STEPS} current="fillBrand" />)
    expect(host.textContent).toContain('Say who the brand is')
  })

  it('shows nothing to someone who opened a share link', () => {
    asShareViewer()
    render(<FlowSteps steps={STEPS} current="fillBrand" />)
    expect(host.textContent).toBe('')
  })
})

describe('SaveBanner in a shared session', () => {
  it('warns the owner when their work is not reaching their account', () => {
    render(<SaveBanner />)
    expect(host.textContent).toContain('saved on this device only')
  })

  it('says nothing to a share viewer, who has no account for it to reach', () => {
    asShareViewer()
    render(<SaveBanner />)
    expect(host.textContent).toBe('')
  })
})
