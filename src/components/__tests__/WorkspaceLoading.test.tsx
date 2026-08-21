// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { WorkspaceLoading } from '../WorkspaceLoading'

/**
 * AN EMPTY WORKSPACE AND AN UNREAD ONE LOOK IDENTICAL, and only one of them is bad news.
 *
 * The shell used to render against empty slices for the whole of the read — no brands, no
 * campaigns, an empty canvas — which is exactly what a workspace that had lost everything looks
 * like. That is not hypothetical: a session read a brand mid-load, found nothing, and concluded the
 * app and its data were on different databases. A person has fewer ways to check than that session
 * did, and just sees their work gone.
 *
 * What this pins is the part a screen reader depends on and a refactor can quietly drop: the region
 * announces itself, and it says what is being waited for rather than only that something is.
 */

let root: Root | null = null
let host: HTMLDivElement | null = null

const render = () => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root!.render(<WorkspaceLoading />)
  })
  return host
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe('the workspace load', () => {
  it('announces itself as a live status, so it is not silent to a screen reader', () => {
    const el = render().querySelector('[role="status"]')
    expect(el).toBeTruthy()
    expect(el?.getAttribute('aria-live')).toBe('polite')
  })

  it('says what is being waited for, not merely that something is', () => {
    const text = render().textContent ?? ''
    expect(text).toMatch(/loading your workspace/i)
    // The reassurance is the point — the work exists and is on its way.
    expect(text).toMatch(/brands/i)
    expect(text).toMatch(/campaigns/i)
  })

  it('hides the decoration from assistive tech, which would otherwise read three empty spans', () => {
    expect(render().querySelector('.ws-loading-mark')?.getAttribute('aria-hidden')).toBe('true')
  })
})
