// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTrafficStore } from '../useTrafficStore'
import type { SmartObject } from '../../domain/smartObject'

/**
 * DELETING A BRAND MUST NOT TAKE THE HOUSE'S SHARED OBJECTS WITH IT.
 *
 * The purge sweeps smart objects by brand NAME, and rightly: leaving them would hand a recreated
 * brand of the same name a library of bundles pointing at records that no longer exist.
 *
 * A shared object breaks that reasoning, and the third rung is what broke it. It keeps `brand` as
 * PROVENANCE — where it was built — not as who may use it. So a bundle that every brand reaches
 * would be deleted from all of them because of the brand it happened to be made on, and the damage
 * is invisible at the moment it happens: you deleted one client and lost a disclaimer that eleven
 * other campaigns were using.
 *
 * The reverse case is checked too, because a fix that keeps everything is not a fix.
 */

const obj = (over: Partial<SmartObject>): SmartObject => ({
  id: 'so',
  name: 'Object',
  refs: [],
  contents: [],
  ...over,
})

const GONE = 'Acme'
const KEPT = 'Globex'

beforeEach(() => {
  localStorage.clear()
  useTrafficStore.setState({
    smartObjects: [
      obj({ id: 'shared_from_acme', name: 'Legal disclaimer', scope: 'shared', brand: GONE }),
      obj({ id: 'brand_of_acme', name: "Acme's buyer", scope: 'brand', brand: GONE }),
      obj({ id: 'local_of_acme', name: 'A one-off', scope: 'campaign', brand: GONE, campaign: 'Acme — Fall' }),
      obj({ id: 'brand_of_globex', name: "Globex's buyer", scope: 'brand', brand: KEPT }),
    ],
    rows: [],
    campaignList: [],
  })
})

afterEach(() => {
  useTrafficStore.setState({ smartObjects: [], rows: [], campaignList: [] })
  localStorage.clear()
})

describe('deleting a brand', () => {
  it('keeps the shared object and sweeps that brand’s own', async () => {
    await useTrafficStore.getState().deleteClient(GONE)
    const left = useTrafficStore.getState().smartObjects.map((o) => o.id)

    expect(left, 'shared belongs to the house, not to the brand it was made on').toContain('shared_from_acme')
    // And the sweep still sweeps: an object nobody else can reach goes with its brand.
    expect(left, "the brand's own library object").not.toContain('brand_of_acme')
    expect(left, 'a one-off on one of its campaigns').not.toContain('local_of_acme')
    expect(left, 'another brand is untouched').toContain('brand_of_globex')
  })
})
