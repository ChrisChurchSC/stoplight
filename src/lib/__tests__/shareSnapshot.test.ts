// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { buildShareSnapshot, type SnapshotState } from '../shareSnapshot'
import { registerCampaign } from '../../domain/clients'

/**
 * A SHARED BOARD ARRIVES WITH THE RECORDS ITS CARDS POINT AT.
 *
 * The board travels, and a card on it is a kind plus a refId into one of the record collections. So
 * a collection left out of the snapshot does not merely hide a page — it lands every card of that
 * kind on the recipient's canvas pointing at a record that is not there. Brand objects, products,
 * concepts, seasons and data sets were all missing, which meant the Brand card wired into the brief,
 * the card naming the campaign's whole brand, arrived with nothing behind it: it still showed a name
 * (a card falls back to what it was called) while reading as nothing picked, and its own record was
 * absent from its picker.
 *
 * Scoping is the other half and is why these are asserted pair by pair: a link that leaked another
 * client's positioning would be a worse bug than the one this fixes.
 *
 * jsdom because buildShareSnapshot reads localStorage directly for the slices that live only there.
 */

const brandTagged = (id: string, name: string, brand?: string) => ({ id, name, brand })

const state = (): SnapshotState => ({
  rows: [],
  campaignList: [{ name: 'Acme — Alpha', client: 'Acme' }],
  flowBoards: [],
  brandObjects: [
    brandTagged('bo_acme', 'Acme', 'Acme'),
    brandTagged('bo_globex', 'Globex', 'Globex'),
    brandTagged('bo_loose', 'Authored before tagging'),
  ],
  products: [brandTagged('p_acme', 'Anvil', 'Acme'), brandTagged('p_globex', 'Spring', 'Globex')],
  concepts: [brandTagged('c_acme', 'Open loop', 'Acme'), brandTagged('c_globex', 'Third rail', 'Globex')],
  seasons: [brandTagged('s_acme', 'Q3', 'Acme'), brandTagged('s_globex', 'Q4', 'Globex')],
  brandDatasets: [
    { id: 'ds_acme', brand: 'Acme', name: 'Search terms' },
    { id: 'ds_globex', brand: 'Globex', name: 'Store list' },
  ],
})

const ids = (snap: Record<string, unknown>, key: string): string[] =>
  (snap[key] as { id: string }[]).map((r) => r.id)

describe('buildShareSnapshot — the records a shared board points at', () => {
  registerCampaign('Acme — Alpha', 'Acme')

  it('packs the brand objects a Brand card names', () => {
    // The regression. Without this the campaign's own Brand card arrived naming a record that was
    // not in the snapshot, on the one link whose whole subject is that campaign.
    expect(ids(buildShareSnapshot(state(), 'Acme'), 'stoplight.brandObjects.v1')).toEqual(['bo_acme', 'bo_loose'])
  })

  it('packs products, concepts and seasons the same way', () => {
    const snap = buildShareSnapshot(state(), 'Acme')
    expect(ids(snap, 'stoplight.products.v1')).toEqual(['p_acme'])
    expect(ids(snap, 'stoplight.concepts.v1')).toEqual(['c_acme'])
    expect(ids(snap, 'stoplight.seasons.v1')).toEqual(['s_acme'])
  })

  it('packs the data sets a Data source card names', () => {
    expect(ids(buildShareSnapshot(state(), 'Acme'), 'stoplight.brandDatasets.v1')).toEqual(['ds_acme'])
  })

  it('leaves the other client’s records at home, every one of them', () => {
    const snap = buildShareSnapshot(state(), 'Acme')
    const everything = JSON.stringify(snap)
    for (const gone of ['bo_globex', 'p_globex', 'c_globex', 's_globex', 'ds_globex']) {
      expect(everything).not.toContain(gone)
    }
  })

  it('scopes a campaign share to one brand exactly as a workspace share does', () => {
    // The narrowing a campaign link adds is over CAMPAIGNS, not over the brand's library: the board
    // still needs every record its cards can name.
    const snap = buildShareSnapshot(state(), 'Acme', 'Acme — Alpha')
    expect(ids(snap, 'stoplight.brandObjects.v1')).toEqual(['bo_acme', 'bo_loose'])
    expect(ids(snap, 'stoplight.brandDatasets.v1')).toEqual(['ds_acme'])
  })
})
