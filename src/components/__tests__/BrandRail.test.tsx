// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BrandRail } from '../BrandRail'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * "NO BRAND" IS A STATE THE RAIL MUST LEAVE ALONE.
 *
 * This rail used to force clientFilter to the first brand the moment it became 'all'. It looked
 * harmless — the app is usually inside one brand — but it made the unscoped view unreachable
 * rather than unavailable, and it did so within a frame, so every deliberate widening was undone
 * before anyone saw it. The Campaigns page, the breadcrumb and the global nav all set 'all' on
 * purpose; none of them worked.
 *
 * What that cost: a workspace of 85 campaigns across 12 clients drew whichever client sorted
 * first, said "6 campaigns", and gave no sign the other 79 existed. It reads exactly like data
 * loss. It was reported as data loss.
 *
 * The regression is invisible to types and to every domain test — campaignInIndexScope already
 * returns everything for an unchosen scope, and it always did. The bug was a component effect
 * overwriting the state before that function ever saw it, which is why this test drives the
 * component rather than the helper.
 *
 * See CanvasProjectTabs.test.tsx beside it, written after the same class of bug: a scope quietly
 * changed underneath the index, and nothing looked broken except the numbers.
 */

// React needs telling it is inside a test, or every act() logs a warning and the output
// drowns the result. The suite has no global setup file, so it is declared per file.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useTrafficStore.setState({
    clientFilter: 'all',
    brandRecords: [
      { id: 'b1', name: 'Big Buoy' },
      { id: 'b2', name: 'World Within' },
    ] as never,
  })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useTrafficStore.setState({ clientFilter: 'all' })
})

describe('BrandRail and the unscoped view', () => {
  it('leaves clientFilter at "all" when brands exist', () => {
    act(() => root.render(<BrandRail />))
    expect(useTrafficStore.getState().clientFilter).toBe('all')
  })

  /**
   * The failure mode was a revert, not a refusal: the write landed and was overwritten on the next
   * render. So setting it and reading it back immediately would have passed even with the bug —
   * the assertion has to survive a render.
   */
  it('does not re-narrow a scope that was widened after mount', () => {
    act(() => root.render(<BrandRail />))
    act(() => useTrafficStore.getState().setClientFilter('Big Buoy'))
    expect(useTrafficStore.getState().clientFilter).toBe('Big Buoy')

    act(() => useTrafficStore.getState().setClientFilter('all'))
    // A re-render is where the old effect fired.
    act(() => root.render(<BrandRail />))
    expect(useTrafficStore.getState().clientFilter).toBe('all')
  })

  it('still lets a brand be chosen and kept', () => {
    act(() => root.render(<BrandRail />))
    act(() => useTrafficStore.getState().setClientFilter('World Within'))
    act(() => root.render(<BrandRail />))
    expect(useTrafficStore.getState().clientFilter).toBe('World Within')
  })
})
