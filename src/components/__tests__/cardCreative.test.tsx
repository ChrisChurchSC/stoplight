// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CardCreative } from '../CardCreative'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * THE PANEL SECTION, ACTUALLY RENDERED.
 *
 * The store tests prove the data moves; this proves a person can see it. Worth its own file because
 * every tile resolves its URL through a hook — IndexedDB first, then a signed URL — and a hook
 * ordering mistake or an unguarded await is invisible to a type checker and to a store test, while
 * being the kind of thing that blanks the whole inspector.
 *
 * jsdom has no IndexedDB and the suite runs with no backend, which is the honest worst case: no
 * local bytes, no remote copy. Every tile must still render its name, its size and its actions —
 * a panel that only works where a preview resolves is a panel that breaks on a teammate's machine.
 */

// React needs to be told it is inside a test renderer, or every act() logs a warning that buries
// the actual assertion failures under a hundred lines of stderr.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ROW = 'row_render_1'
const file = (name: string) => new File(['xxxx'], name, { type: 'text/plain' })

let host: HTMLDivElement
let root: Root

const mount = async () => {
  await act(async () => {
    root.render(<CardCreative rowId={ROW} />)
  })
}
const text = () => host.textContent ?? ''
const buttons = () => [...host.querySelectorAll('button')]
const click = async (label: string) => {
  const btn = buttons().find((b) => (b.textContent ?? '').includes(label))
  if (!btn) throw new Error(`no button matching ${label}. Buttons: ${buttons().map((b) => b.textContent).join(' | ')}`)
  await act(async () => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  localStorage.clear()
  useTrafficStore.setState({ cardMedia: {} })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('CardCreative', () => {
  it('offers the upload with nothing attached, and does not pretend there is a carousel', async () => {
    await mount()
    expect(text()).toContain('Final creative')
    expect(text()).toContain('Upload the final creative')
    expect(host.querySelectorAll('.cc-tile')).toHaveLength(0)
  })

  /** No backend configured, so the button has to say where the file will actually go. Telling
   *  someone their work is safe in a workspace that does not exist is the one unrecoverable lie
   *  this panel could tell. */
  it('says files stay on this device when there is no workspace', async () => {
    await mount()
    expect(text()).toContain('Kept on this device')
  })

  it('renders a tile per file, with its name and size, and no preview to fall back on', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('slide_1.txt'), file('slide_2.txt')])
    await mount()
    expect(host.querySelectorAll('.cc-tile')).toHaveLength(2)
    expect(text()).toContain('slide_1.txt')
    expect(text()).toContain('slide_2.txt')
    expect(text()).toContain('4 B')
  })

  it('names a multi-image set a carousel in the header and numbers the slides', async () => {
    useTrafficStore.setState({
      cardMedia: {
        [ROW]: [
          { id: 'a', name: 'a.png', mime: 'image/png', size: 10, kind: 'image', uploadedAt: 0 },
          { id: 'b', name: 'b.png', mime: 'image/png', size: 10, kind: 'image', uploadedAt: 0 },
        ],
      },
    })
    await mount()
    expect(text()).toContain('Carousel · 2 slides')
    expect([...host.querySelectorAll('.cc-tile-n')].map((n) => n.textContent)).toEqual(['1', '2'])
  })

  /** Reorder arrows are for a carousel. On a single file they would be two disabled controls
   *  explaining an order that has no other member. */
  it('shows reorder arrows only when there is something to reorder', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('only.txt')])
    await mount()
    expect(host.querySelectorAll('.cc-act.icon')).toHaveLength(0)
    expect(host.querySelectorAll('.cc-tile-n')).toHaveLength(0)
  })

  it('flags a file that has not reached the workspace', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('a.txt')])
    await mount()
    expect(text()).toContain('On this device only')
  })

  /**
   * DELETE TAKES TWO PRESSES, and the second one is labelled with what it does. A one-press delete
   * on a finished asset somebody spent a day on is the wrong default, and a browser confirm() is
   * not available to us — it is a modal dialog over a canvas.
   */
  it('arms the delete before it fires', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('precious.txt')])
    await mount()

    await click('Delete')
    expect(text()).toContain('Delete for good?')
    // Still there — the first press only armed it.
    expect(useTrafficStore.getState().cardMedia[ROW]).toHaveLength(1)

    await click('Delete for good?')
    expect(useTrafficStore.getState().cardMedia[ROW]).toBeUndefined()
  })

  it('goes back to the empty state once the last file is detached', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('a.txt')])
    await mount()
    await click('Delete')
    await click('Delete for good?')
    expect(host.querySelectorAll('.cc-tile')).toHaveLength(0)
    expect(text()).toContain('Upload the final creative')
  })

  it('reorders the carousel from the arrows', async () => {
    useTrafficStore.setState({
      cardMedia: {
        [ROW]: [
          { id: 'a', name: 'a.png', mime: 'image/png', size: 10, kind: 'image', uploadedAt: 0 },
          { id: 'b', name: 'b.png', mime: 'image/png', size: 10, kind: 'image', uploadedAt: 0 },
        ],
      },
    })
    await mount()
    const down = buttons().find((b) => b.getAttribute('aria-label') === 'Move a.png later')
    expect(down).toBeTruthy()
    await act(async () => {
      down!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useTrafficStore.getState().cardMedia[ROW].map((m) => m.name)).toEqual(['b.png', 'a.png'])
  })
})
