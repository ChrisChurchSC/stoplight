import { describe, expect, it } from 'vitest'
import { liveCampaignNames } from '../clients'

/**
 * WHICH CAMPAIGNS EXIST — the question a tab has to be able to answer about itself.
 *
 * The open-tab drawer is persisted on its own while campaigns are rebuilt from the workspace on
 * every load, so a tab could name a campaign that was no longer anywhere: it rendered as
 * "DRAFTS · <name>" (a campaign the list has never heard of reports no folder, and no folder reads
 * as unfiled) above a Campaigns page saying there was nothing there. Both surfaces read this now,
 * so they cannot disagree about what is real.
 *
 * The rules worth pinning are the two that are easy to get wrong in opposite directions: a campaign
 * that exists ONLY as a value on a row is real, and archived on either side is not.
 */

describe('liveCampaignNames', () => {
  it('counts a campaign the list knows about, with no assets yet', () => {
    expect(liveCampaignNames([], [{ name: 'Q3 Launch' }])).toEqual(new Set(['Q3 Launch']))
  })

  it('counts a campaign that exists only as a value on a live row', () => {
    expect(liveCampaignNames([{ campaign: 'Ingested run' }], [])).toEqual(new Set(['Ingested run']))
  })

  it('does not count an archived campaign, however many rows carry its name', () => {
    const names = liveCampaignNames(
      [{ campaign: 'Deleted', archivedAt: 1 }],
      [{ name: 'Deleted', archivedAt: 1 }],
    )
    expect(names.has('Deleted')).toBe(false)
  })

  /**
   * The half-deleted case, and the reason the row check is not just a fallback: deleteCampaign
   * archives the campaign record AND its rows, so a name left on live rows with an archived record
   * is a campaign whose assets outlived the delete. It is still openable, so it still counts.
   */
  it('counts a campaign whose record is archived but whose live assets remain', () => {
    const names = liveCampaignNames([{ campaign: 'Half deleted' }], [{ name: 'Half deleted', archivedAt: 1 }])
    expect(names.has('Half deleted')).toBe(true)
  })

  it('ignores rows with no campaign, and names that are only whitespace', () => {
    expect(liveCampaignNames([{}, { campaign: '   ' }], [{ name: '  ' }])).toEqual(new Set())
  })

  it('trims, so a name stored with stray spaces matches the tab that carries it', () => {
    expect(liveCampaignNames([{ campaign: '  Q3 Launch  ' }], [])).toEqual(new Set(['Q3 Launch']))
  })

  /**
   * SURVIVES A MALFORMED RECORD, because this reads persisted data and `name` being non-optional on
   * the type is a promise about new records, not about what is already in a workspace.
   *
   * This is not hypothetical: reaching for .trim() on a name that was not there threw a TypeError
   * inside the useMemo that builds the campaigns gallery, and a throw there takes the render with
   * it — a signed-in user refreshed and the page came back with no campaigns on it. One bad row
   * must cost its own entry and nothing else.
   */
  it('skips a record with no name instead of throwing, and still returns the good ones', () => {
    const campaigns = [{ name: 'Q3 Launch' }, {}, { name: null }, { name: 'Q4 Launch' }] as never as { name: string }[]
    expect(() => liveCampaignNames([], campaigns)).not.toThrow()
    expect(liveCampaignNames([], campaigns)).toEqual(new Set(['Q3 Launch', 'Q4 Launch']))
  })

  it('survives a hole in the rows array too', () => {
    const rows = [{ campaign: 'Q3 Launch' }, undefined, { campaign: null }] as never as { campaign?: string }[]
    expect(liveCampaignNames(rows, [])).toEqual(new Set(['Q3 Launch']))
  })

  it('is a set: one name from both sides collapses to one campaign', () => {
    const names = liveCampaignNames([{ campaign: 'Q3 Launch' }], [{ name: 'Q3 Launch' }])
    expect([...names]).toEqual(['Q3 Launch'])
  })
})

/**
 * The filter the store applies to the persisted tab list. Kept here as the plain expression of the
 * rule — a tab survives exactly when its campaign does — so the intent is pinned even though the
 * gating (wait for the workspace to load, then do it once) lives in the store.
 */
describe('pruning the open tabs', () => {
  const keep = (open: string[], rows: { campaign?: string; archivedAt?: number }[], campaigns: { name: string; archivedAt?: number }[]) => {
    const live = liveCampaignNames(rows, campaigns)
    return open.filter((c) => live.has(c))
  }

  it('drops a tab whose campaign is gone and keeps the ones that are not', () => {
    expect(keep(['Q3 Launch', 'Ghost campaign'], [], [{ name: 'Q3 Launch' }])).toEqual(['Q3 Launch'])
  })

  it('keeps every tab when nothing is orphaned', () => {
    const open = ['A', 'B']
    expect(keep(open, [], [{ name: 'A' }, { name: 'B' }])).toEqual(open)
  })

  it('preserves tab order, since the drawer is ordered', () => {
    expect(keep(['C', 'A', 'B'], [], [{ name: 'A' }, { name: 'B' }, { name: 'C' }])).toEqual(['C', 'A', 'B'])
  })

  /**
   * The store refuses to act on an empty set (see pruneOpenProjects), so this pins the shape of that
   * refusal rather than the filter: seeing no campaigns at all means "we cannot see", not "there are
   * none", and the difference is every tab you had open.
   */
  it('would strip everything if the set is empty — which is exactly why the store refuses to', () => {
    expect(keep(['A', 'B'], [], [])).toEqual([])
    expect(liveCampaignNames([], []).size).toBe(0)
  })
})
