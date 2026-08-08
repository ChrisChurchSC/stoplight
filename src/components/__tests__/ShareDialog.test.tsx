// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ShareDialog } from '../ShareDialog'
import { decodeShareToken } from '../../lib/shareLink'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * SHARING A CAMPAIGN IS ONE LINK, NOT A PILE OF THEM.
 *
 * The dialog used to mint. You chose a role, pressed Create, then pressed Copy, and every Create
 * stacked another grant onto a list of opaque ids ('m2x9k1_4b7q') that no one could tell apart, so
 * revoking the right one was guesswork. Now the link exists the moment the dialog opens and each
 * access level keeps exactly one, so the count is the thing worth asserting: reopening, toggling
 * access and toggling back must all leave it where it was.
 *
 * Driven rather than reasoned about because none of it is a type error. Reuse-or-mint is an effect
 * reading a filtered slice of store state, and "did that toggle create a second link?" is only
 * answerable by clicking it.
 *
 * See BufferedTextarea.test.tsx for why the environment pragma is per-file rather than global.
 */

const CAMPAIGN = 'Acme — Alpha'
/** Two brands, so nothing resolves by default — the single-brand shortcut is its own case below. */
const BRANDS = ['Acme', 'Globex']

let host: HTMLDivElement
let root: Root

/** An owner standing on Acme's campaign, share dialog open, nothing handed out yet. */
const openOnCampaign = {
  clientFilter: 'Acme',
  clientList: BRANDS,
  campaignList: [],
  shareDialogOpen: true,
  shareDialogCampaign: CAMPAIGN,
  shares: [],
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useTrafficStore.setState(openOnCampaign)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useTrafficStore.setState({
    shareDialogOpen: false,
    shareDialogCampaign: null,
    shares: [],
    clientFilter: 'all',
    clientList: [],
    campaignList: [],
  })
})

const render = () => act(() => root.render(<ShareDialog />))
const click = (sel: string) => {
  const el = host.querySelector(sel)
  expect(el, `no element matching ${sel}`).toBeTruthy()
  act(() => el?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
/** The access option that is NOT currently selected. */
const otherAccess = () => '.share-access-opt:not(.on)'
const linkField = () => host.querySelector<HTMLInputElement>('.share-link')
const grants = () => useTrafficStore.getState().shares

describe('ShareDialog — one link per access level', () => {
  it('has a link ready to copy on open, with no Create step', () => {
    render()

    expect(linkField()?.value).toMatch(/\?share=/)
    expect(grants()).toHaveLength(1)
    // The old first move: choose a role, then press Create. Neither is in the way any more.
    expect(host.querySelector('.share-role')).toBeNull()
    expect(host.querySelector('.share-make')).toBeNull()
  })

  it('grants the campaign, not the whole brand', () => {
    render()

    const token = decodeShareToken(new URL(linkField()!.value).searchParams.get('share')!)
    expect(token?.campaign).toBe(CAMPAIGN)
    expect(token?.client).toBe('Acme')
    // Least privilege is where it lands, so handing out edit rights is always deliberate.
    expect(token?.role).toBe('stakeholder')
  })

  it('reuses the same link when the dialog is reopened', () => {
    render()
    const first = linkField()?.value

    act(() => {
      useTrafficStore.getState().closeShareDialog()
    })
    act(() => {
      useTrafficStore.getState().openShareDialog(CAMPAIGN)
    })

    expect(linkField()?.value).toBe(first)
    expect(grants()).toHaveLength(1)
  })

  it('keeps one link per access level, however often you toggle', () => {
    render()
    const viewLink = linkField()?.value

    click(otherAccess())
    const editLink = linkField()?.value
    expect(editLink).not.toBe(viewLink)
    expect(decodeShareToken(new URL(editLink!).searchParams.get('share')!)?.role).toBe('editor')

    // Back and forth: reuse, never mint. This is the regression the old dialog shipped, where
    // every visit to a role added another indistinguishable grant.
    click(otherAccess())
    click(otherAccess())
    click(otherAccess())

    expect(linkField()?.value).toBe(viewLink)
    expect(grants()).toHaveLength(2)
    expect(grants().map((s) => s.role).sort()).toEqual(['editor', 'stakeholder'])
  })

  it('stops sharing without taking the other access level down with it', () => {
    render()
    click(otherAccess()) // mint the editor link too
    click(otherAccess()) // back to the view link, which is the one Stop sharing acts on

    click('.share-stop')

    expect(linkField()).toBeNull()
    expect(grants().map((s) => s.role)).toEqual(['editor'])
  })

  it('does not immediately hand back a link it was just told to revoke', () => {
    render()

    click('.share-stop')

    // The mint-on-open effect runs again on that state change; only `stopped` holds it off.
    expect(grants()).toHaveLength(0)
    expect(host.querySelector('.share-make')).toBeTruthy()
  })

  it('shares again on request after stopping', () => {
    render()
    click('.share-stop')

    click('.share-make')

    expect(linkField()?.value).toMatch(/\?share=/)
    expect(grants()).toHaveLength(1)
  })
})

describe('ShareDialog — links left over from the stacking dialog', () => {
  const legacy = (id: string) => ({
    id,
    client: 'Acme',
    role: 'stakeholder' as const,
    campaign: CAMPAIGN,
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  it('surfaces the extras, because a live grant nobody can see is one nobody can revoke', () => {
    useTrafficStore.setState({ shares: [legacy('shr_a'), legacy('shr_b'), legacy('shr_c')] })
    render()

    expect(host.querySelector('.share-extra')?.textContent).toContain('2 older links')
  })

  it('revokes the extras and leaves the live link alone', () => {
    useTrafficStore.setState({ shares: [legacy('shr_a'), legacy('shr_b'), legacy('shr_c')] })
    render()

    click('.share-extra-revoke')

    expect(grants().map((s) => s.id)).toEqual(['shr_a'])
    expect(linkField()?.value).toMatch(/\?share=/)
    expect(host.querySelector('.share-extra')).toBeNull()
  })

  it('says nothing when there is only the one link', () => {
    render()

    expect(host.querySelector('.share-extra')).toBeNull()
  })
})

/**
 * WHICH BRAND THE LINK IS SCOPED TO, when the workspace filter is not it.
 *
 * clientFilter is a browsing scope: it resets to 'all' on every load, and the Campaigns index opens
 * a campaign without narrowing it, because an index that hid the other brands' work would be no use
 * for picking one. The dialog read that filter alone, so a campaign opened from the index — brand
 * named on the rail, on the pickers, on the Brand card wired into its brief — answered "Pick a brand
 * first, then share." The brand was never missing; only this one dialog could not see it.
 *
 * Driven rather than reasoned about for the same reason as the tests above: every value here is a
 * plain string, and "which brand did the grant get" is only answerable by opening the dialog.
 */
describe('ShareDialog — the brand a link is scoped to', () => {
  const campaignRecord = { name: CAMPAIGN, client: 'Acme', strategy: 'Current state' }

  it('shares a campaign the index opened, without waiting for a brand to be picked', () => {
    useTrafficStore.setState({ clientFilter: 'all', campaignList: [campaignRecord] })
    render()

    expect(host.querySelector('.share-blocked')).toBeNull()
    const token = decodeShareToken(new URL(linkField()!.value).searchParams.get('share')!)
    expect(token?.client).toBe('Acme')
    expect(token?.campaign).toBe(CAMPAIGN)
  })

  it('hands out the campaign under its own brand, not the one the rail is on', () => {
    // The snapshot behind the link is built per brand — voice, proof, audiences, profile. Scoped to
    // Globex, an Acme campaign would travel with another client's library attached.
    useTrafficStore.setState({ clientFilter: 'Globex', campaignList: [campaignRecord] })
    render()

    const token = decodeShareToken(new URL(linkField()!.value).searchParams.get('share')!)
    expect(token?.client).toBe('Acme')
  })

  it('names the campaign without its brand prefix', () => {
    useTrafficStore.setState({ clientFilter: 'all', campaignList: [campaignRecord] })
    render()

    expect(host.querySelector('.share-title')?.textContent).toBe('Share Alpha')
  })

  it('takes the only brand in the workspace as the answer', () => {
    // The one safe shortcut, and the same one every record picker on the board uses: with nothing
    // to choose between there is no second brand for a link to leak from.
    useTrafficStore.setState({ clientFilter: 'all', clientList: ['Acme'], shareDialogCampaign: null })
    render()

    expect(linkField()?.value).toMatch(/\?share=/)
    expect(grants()[0]?.client).toBe('Acme')
  })

  it('asks for a brand when the workspace holds several and none is chosen', () => {
    useTrafficStore.setState({ clientFilter: 'all', shareDialogCampaign: null })
    render()

    expect(host.querySelector('.share-blocked')).toBeTruthy()
    expect(linkField()).toBeNull()
    expect(grants()).toHaveLength(0)
  })

  it('still refuses a campaign filed under nobody, with two brands to choose between', () => {
    // Unassigned is not a brand. Falling through to the canvas rule is what keeps this a refusal
    // rather than a guess between Acme and Globex.
    useTrafficStore.setState({ clientFilter: 'all', campaignList: [{ ...campaignRecord, client: 'Unassigned' }] })
    render()

    expect(host.querySelector('.share-blocked')).toBeTruthy()
    expect(grants()).toHaveLength(0)
  })
})
