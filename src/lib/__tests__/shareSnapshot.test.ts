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

/**
 * A CAMPAIGN WHOSE BRAND IS ON ITS BOARD IS STILL THAT BRAND'S CAMPAIGN.
 *
 * bindCampaignBrand writes a campaign's `client` when a Brand card is wired into its brief, so a
 * campaign predating that wiring reads Unassigned while its board plainly names a brand. The link is
 * scoped by that board (see ShareDialog), and the snapshot was selecting by the record field alone —
 * so the two ends disagreed about the same campaign and it was left out of its own link. Its assets
 * still travelled, because rows are attributed by campaign NAME, which is what made the result blank
 * rather than empty: the work arrived with no campaign record behind it.
 */
describe('buildShareSnapshot — a campaign filed under nobody', () => {
  const CAMPAIGN = 'Q3 BAU'
  const unfiled = (): SnapshotState => ({
    ...state(),
    campaignList: [{ name: CAMPAIGN, client: 'Unassigned', strategy: 'Current state' }],
    rows: [{ id: 'r1', campaign: CAMPAIGN }],
    flowBoards: [
      {
        key: CAMPAIGN,
        objects: [{ id: 'n1', kind: 'brand', refId: 'bo_acme' }],
        connectors: [{ from: 'n1', to: 'campaign' }],
      },
    ],
  })

  it('travels with its own campaign link', () => {
    // The regression. The subject of the link is not a member of a set to be filtered.
    const snap = buildShareSnapshot(unfiled(), 'Acme', CAMPAIGN)
    expect((snap['stoplight.campaigns.v1'] as { name: string }[]).map((c) => c.name)).toEqual([CAMPAIGN])
    expect((snap['stoplight.sheet.v1'] as { rows: unknown[] }).rows).toHaveLength(1)
  })

  it('travels with a brand link too, read off the Brand card on its board', () => {
    const snap = buildShareSnapshot(unfiled(), 'Acme')
    expect((snap['stoplight.campaigns.v1'] as { name: string }[]).map((c) => c.name)).toEqual([CAMPAIGN])
    expect((snap['stoplight.sheet.v1'] as { rows: unknown[] }).rows).toHaveLength(1)
  })

  it('does not follow another brand’s link', () => {
    // Reading the card is not the same as admitting every unfiled campaign: the card names Acme, so
    // Globex's link carries none of it.
    const snap = buildShareSnapshot(unfiled(), 'Globex')
    expect(snap['stoplight.campaigns.v1']).toEqual([])
    expect((snap['stoplight.sheet.v1'] as { rows: unknown[] }).rows).toEqual([])
  })

  it('stays out of a brand link when nothing names a brand at all', () => {
    const snap = buildShareSnapshot({ ...unfiled(), flowBoards: [] }, 'Acme')
    expect(snap['stoplight.campaigns.v1']).toEqual([])
  })
})
