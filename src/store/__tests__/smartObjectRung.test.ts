// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { useTrafficStore } from '../useTrafficStore'
import { visibleOn, type SmartObject } from '../../domain/smartObject'

/**
 * DEMOTING RE-HOMES THE OBJECT TO THE BOARD DOING IT.
 *
 * `campaign` means two different things depending on the rung, which is what made this a bug. On
 * 'brand' and 'shared' it is provenance — where the bundle was built, which the panel prints. On
 * 'campaign' it is the whole of visibility: exactly one board may see it.
 *
 * So demoting without saying which board left the object scoped to the one it was BUILT on. Drag a
 * shared object onto "This campaign" from another campaign's board and it appeared nowhere: it went
 * to a board you were not standing on, silently, with the panel one tile shorter than you expected.
 *
 * This calls the store action rather than asserting on an object built by hand — the point is what
 * setSmartObjectScope WRITES, and a test that constructs the result itself would pass with the
 * action gutted.
 */

const HERE = 'Acme — Fall'
const BUILT = 'Globex — Spring'

const obj = (over: Partial<SmartObject>): SmartObject => ({ id: 'so', name: 'Bundle', refs: [], contents: [], ...over })
const read = (id: string) => useTrafficStore.getState().smartObjects.find((o) => o.id === id)!

beforeEach(() => {
  localStorage.clear()
  useTrafficStore.setState({
    smartObjects: [obj({ id: 'far', scope: 'shared', brand: 'Globex', campaign: BUILT })],
  })
})

describe('setSmartObjectScope', () => {
  it('scopes a demoted object to the board that demoted it', () => {
    useTrafficStore.getState().setSmartObjectScope('far', 'campaign', { brand: 'Acme', campaign: HERE })
    const o = read('far')

    expect(o.scope).toBe('campaign')
    expect(visibleOn(o, { campaign: HERE }), 'the board you dropped it on').toBe(true)
    expect(visibleOn(o, { campaign: BUILT }), 'not the one it was built on').toBe(false)
  })

  it('leaves provenance alone going UP, where campaign is not permission', () => {
    // The same field, untouched on the way up: 'brand' and 'shared' read it as where the bundle came
    // from, which is what the panel's "promoted from …" line prints.
    useTrafficStore.setState({ smartObjects: [obj({ id: 'up', scope: 'campaign', brand: 'Acme', campaign: BUILT })] })
    useTrafficStore.getState().setSmartObjectScope('up', 'brand', { brand: 'Acme', campaign: HERE })
    const o = read('up')

    expect(o.scope).toBe('brand')
    expect(o.campaign, 'still records where it was made').toBe(BUILT)
    expect(visibleOn(o, { brand: 'Acme' })).toBe(true)
  })
})
