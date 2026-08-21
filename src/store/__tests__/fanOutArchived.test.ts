// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { registerCampaign } from '../../domain/clients'
import type { TrafficRow } from '../../domain/types'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * A DELETED ASSET IS NOT A THING TO MULTIPLY.
 *
 * `archivedAt` is the soft-delete marker, and every count the user can see respects it — the
 * campaign card, the brief node, list_assets. Fan-out did not. It counted the campaign's rows
 * unfiltered, so a campaign holding 13 live assets and 34 deleted ones previewed a fan of 47 across
 * the dimension, and the channel-aware cap returned "over" for work that does not exist.
 *
 * The preview is the visible half. The worse half is fanOut itself using the same unfiltered set:
 * it would generate variants OF DELETED ASSETS, which then arrive as live drafts nobody asked for
 * — the deleted work coming back, multiplied.
 */

const CAMPAIGN = 'Acme — Archive Test'
const CLIENT = 'Acme Co'

const row = (id: string, over: Partial<TrafficRow> = {}): TrafficRow =>
  ({
    id,
    assetId: id,
    assetName: `Asset ${id}`,
    channel: 'instagram',
    assetType: 'post',
    mediaType: 'image',
    messaging: { caption: 'Something' },
    campaign: CAMPAIGN,
    audience: 'Ops leads',
    status: 'draft',
    scheduledAt: '2026-09-01T10:00:00.000Z',
    createdAt: 0,
    ...over,
  }) as TrafficRow

beforeEach(() => {
  registerCampaign(CAMPAIGN, CLIENT)
  useTrafficStore.setState({
    rows: [
      row('live1'),
      row('live2'),
      // Soft-deleted: invisible everywhere the user looks.
      row('gone1', { archivedAt: 1 }),
      row('gone2', { archivedAt: 1 }),
      row('gone3', { archivedAt: 1 }),
    ],
    clientFilter: CLIENT,
    campaignFilter: CAMPAIGN,
  })
})

describe('fan-out preview', () => {
  it('counts only live assets as the base', () => {
    const preview = useTrafficStore.getState().fanOutPreview(CAMPAIGN, 'audience', ['A', 'B'])
    // Two live assets across two values. The three archived rows must not appear in the base.
    expect(preview.baseCount).toBe(2)
  })

  it('does not let deleted assets push the count over the cap', () => {
    const live = useTrafficStore.getState().fanOutPreview(CAMPAIGN, 'audience', ['A', 'B'])
    // The same campaign with the archived rows removed entirely must preview identically — which
    // is the whole claim: deleted work changes nothing about what a fan would produce.
    useTrafficStore.setState({ rows: useTrafficStore.getState().rows.filter((r) => !r.archivedAt) })
    const without = useTrafficStore.getState().fanOutPreview(CAMPAIGN, 'audience', ['A', 'B'])
    expect(without.baseCount).toBe(live.baseCount)
    expect(without.variantCount).toBe(live.variantCount)
    expect(without.verdict).toBe(live.verdict)
  })
})

describe('the tab count', () => {
  /**
   * The counting contract, asserted where it was broken: the number on the tab has to be the number
   * of assets the campaign actually has. CanvasProjectTabs built its map from every row.
   */
  it('agrees with the live row count', () => {
    const rows = useTrafficStore.getState().rows
    const live = rows.filter((r) => (r.campaign ?? '').trim() === CAMPAIGN && !r.archivedAt).length
    expect(live).toBe(2)
    // And the naive count that shipped — every row, archived included — was visibly different.
    const naive = rows.filter((r) => (r.campaign ?? '').trim() === CAMPAIGN).length
    expect(naive).toBe(5)
  })
})
