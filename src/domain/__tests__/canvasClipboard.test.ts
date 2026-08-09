import { describe, expect, it } from 'vitest'
import { describeClipboard, pasteObjects, pasteRows, type CanvasClipboard } from '../canvasClipboard'
import type { CanvasObject } from '../flowBoard'
import type { TrafficRow } from '../types'

/**
 * WHAT A COPY IS ALLOWED TO CARRY INTO ANOTHER CAMPAIGN.
 *
 * Two failures are worth a test each, and neither is visible on screen when it happens:
 *
 *  - A card carrying one brand's records onto another brand's board. It looks exactly like a card
 *    that worked, right up until the copy writer is handed a stranger's audience as this campaign's.
 *  - A pasted asset carrying the original's measured performance. A draft that has never been
 *    published arrives claiming impressions, a spend and a posted date, and every roll-up that
 *    counts those believes it.
 */

const obj = (id: string, over: Partial<CanvasObject> = {}): CanvasObject => ({ id, kind: 'audience', text: '', ...over })

const clip = (over: Partial<CanvasClipboard> = {}): CanvasClipboard => ({
  fromCampaign: 'Relaunch',
  fromBrand: 'iScribe',
  objects: [],
  placements: [],
  connectors: [],
  pos: {},
  groups: [],
  rows: [],
  delivKeys: [],
  detachedKeys: [],
  copiedAt: 0,
  ...over,
})

const NONE = new Set<string>()
const NOMAP = new Map<string, string>()
const AT = { toBrand: 'iScribe', origin: { x: 0, y: 0 }, knownSmartObjectIds: NONE, liveTargets: NONE, outputMap: NOMAP }

describe('pasting cards into another campaign', () => {
  it('gives every card a new id, so the copy and the original are two cards', () => {
    const out = pasteObjects(clip({ objects: [obj('co_1'), obj('co_2')] }), AT)
    expect(out.objects).toHaveLength(2)
    expect(out.objects.map((o) => o.id)).not.toContain('co_1')
    expect(new Set(out.objects.map((o) => o.id)).size).toBe(2)
  })

  it('keeps a wire into the brief, which is the thing that makes a pasted card count', () => {
    const out = pasteObjects(clip({ objects: [obj('co_1')], connectors: [{ from: 'co_1', to: 'campaign' }] }), AT)
    const id = out.idMap.get('co_1')
    expect(out.connectors).toEqual([{ from: id, to: 'campaign' }])
  })

  it('keeps a wire between two copied cards, remapped to their new ids', () => {
    const out = pasteObjects(clip({ objects: [obj('co_1'), obj('co_2')], connectors: [{ from: 'co_1', to: 'co_2' }] }), AT)
    expect(out.connectors).toEqual([{ from: out.idMap.get('co_1'), to: out.idMap.get('co_2') }])
  })

  it('drops a wire to something that did not come and does not exist here', () => {
    const out = pasteObjects(clip({ objects: [obj('co_1')], connectors: [{ from: 'co_1', to: 'blog|article' }] }), AT)
    expect(out.connectors).toEqual([])
  })

  it('keeps a wire to a channel arriving in the same paste, under the name it arrives with', () => {
    const out = pasteObjects(
      clip({ objects: [obj('co_1')], connectors: [{ from: 'co_1', to: 'instagram|feed|↳Teaser' }] }),
      { ...AT, outputMap: new Map([['instagram|feed|↳Teaser', 'instagram|feed']]) },
    )
    expect(out.connectors).toEqual([{ from: out.idMap.get('co_1'), to: 'instagram|feed' }])
  })

  it('preserves the arrangement and lands it where it was asked to', () => {
    const out = pasteObjects(
      clip({ objects: [obj('co_1'), obj('co_2')], pos: { co_1: { x: 300, y: 100 }, co_2: { x: 380, y: 260 } } }),
      { ...AT, origin: { x: 40, y: 40 } },
    )
    const a = out.pos[out.idMap.get('co_1')!]
    const b = out.pos[out.idMap.get('co_2')!]
    expect(a).toEqual({ x: 40, y: 40 })
    // The gap between the two cards is what was worth copying, so it survives the translation.
    expect({ x: b.x - a.x, y: b.y - a.y }).toEqual({ x: 80, y: 160 })
  })

  it('brings a group along, and dissolves one left holding a single card', () => {
    const out = pasteObjects(
      clip({
        objects: [obj('co_1'), obj('co_2')],
        groups: [
          { id: 'g1', name: 'Launch week', ids: ['co_1', 'co_2'] },
          { id: 'g2', name: 'Half here', ids: ['co_1', 'co_9'] },
        ],
      }),
      AT,
    )
    expect(out.groups).toHaveLength(1)
    expect(out.groups[0].name).toBe('Launch week')
    expect(out.groups[0].ids).toEqual([out.idMap.get('co_1'), out.idMap.get('co_2')])
  })

  /**
   * THE LEAK THIS EXISTS TO STOP. Record libraries are per brand, so an id carried across names a
   * record of a brand this board has nothing to do with — and the card would draw as linked, list in
   * the inspector as an established record, and reach the copy writer as this campaign's audience.
   */
  it('drops the records a card pointed at when the brand changes', () => {
    const out = pasteObjects(
      clip({ objects: [obj('co_1', { refId: 'seg_acme', smartObjectId: 'so_acme', name: 'Enterprise, cold' })] }),
      { ...AT, toBrand: 'Arbitrum' },
    )
    expect(out.objects[0].refId).toBeUndefined()
    expect(out.objects[0].smartObjectId).toBeUndefined()
    expect(out.unlinked).toBe(1)
  })

  it('keeps what the person typed on that card, so the paste still saves the work', () => {
    const card = obj('co_1', {
      refId: 'seg_acme',
      name: 'Enterprise, cold',
      text: 'Renewals team, not the buyer',
      direction: [{ key: 'pain', value: 'Nobody owns the handover' }],
    })
    const out = pasteObjects(clip({ objects: [card] }), { ...AT, toBrand: 'Arbitrum' })
    expect(out.objects[0].name).toBe('Enterprise, cold')
    expect(out.objects[0].text).toBe('Renewals team, not the buyer')
    expect(out.objects[0].direction).toEqual([{ key: 'pain', value: 'Nobody owns the handover' }])
  })

  it('keeps the record when the brand is the same', () => {
    const out = pasteObjects(clip({ objects: [obj('co_1', { refId: 'seg_acme' })] }), AT)
    expect(out.objects[0].refId).toBe('seg_acme')
    expect(out.unlinked).toBe(0)
  })

  /**
   * A placement draws a brand-library object, so it cannot be cloned onto a board whose library has
   * no such object. Releasing it to its member cards loses the wrapper and keeps the content, which
   * is the trade the "Release" command already makes on purpose.
   */
  it('releases a smart object to its cards rather than framing nothing', () => {
    const out = pasteObjects(
      clip({
        objects: [obj('co_1'), obj('co_2')],
        placements: [{ id: 'pl_1', smartObjectId: 'so_gone', memberIds: ['co_1', 'co_2'] }],
      }),
      AT,
    )
    expect(out.placements).toEqual([])
    expect(out.objects).toHaveLength(2)
  })

  it('keeps the smart object when this board can resolve it', () => {
    const out = pasteObjects(
      clip({ objects: [obj('co_1')], placements: [{ id: 'pl_1', smartObjectId: 'so_here', memberIds: ['co_1'] }] }),
      { ...AT, knownSmartObjectIds: new Set(['so_here']) },
    )
    expect(out.placements).toHaveLength(1)
    expect(out.placements[0].memberIds).toEqual([out.idMap.get('co_1')])
  })

  /**
   * AND THE RELEASED CARDS KEEP THE WIRE THE WRAPPER WAS CARRYING.
   *
   * Releasing the placement is only "keeps the content" if the content still reaches something. The
   * placement held the wire — you wire the object, not the cards in it — and its id maps to nothing
   * on the target board, so every edge touching it used to be discarded and the cards landed loose
   * and unattached. On a cross-brand paste that happened every time.
   */
  it('gives the released cards the wire the placement was carrying', () => {
    const out = pasteObjects(
      clip({
        objects: [obj('co_1'), obj('co_2')],
        placements: [{ id: 'pl_1', smartObjectId: 'so_gone', memberIds: ['co_1', 'co_2'] }],
        connectors: [{ from: 'pl_1', to: 'campaign' }],
      }),
      AT,
    )
    expect(out.connectors).toEqual([
      { from: out.idMap.get('co_1'), to: 'campaign' },
      { from: out.idMap.get('co_2'), to: 'campaign' },
    ])
  })

  it('carries a wire INTO the placement onto its cards as well', () => {
    const out = pasteObjects(
      clip({
        objects: [obj('co_1'), obj('co_2')],
        placements: [{ id: 'pl_1', smartObjectId: 'so_gone', memberIds: ['co_2'] }],
        connectors: [{ from: 'co_1', to: 'pl_1' }],
      }),
      AT,
    )
    expect(out.connectors).toEqual([{ from: out.idMap.get('co_1'), to: out.idMap.get('co_2') }])
  })

  it('never lands a self-edge or the same edge twice', () => {
    // A member already wired in its own right, plus the wrapper's wire, is one edge. A member wired
    // to its own container would become a card wired to itself.
    const out = pasteObjects(
      clip({
        objects: [obj('co_1'), obj('co_2')],
        placements: [{ id: 'pl_1', smartObjectId: 'so_gone', memberIds: ['co_1', 'co_2'] }],
        connectors: [
          { from: 'pl_1', to: 'campaign' },
          { from: 'co_1', to: 'campaign' },
          { from: 'co_1', to: 'pl_1' },
        ],
      }),
      AT,
    )
    expect(out.connectors).toEqual([
      { from: out.idMap.get('co_1'), to: 'campaign' },
      { from: out.idMap.get('co_2'), to: 'campaign' },
      { from: out.idMap.get('co_1'), to: out.idMap.get('co_2') },
    ])
  })

  it('drops the wire when the placement had no cards to release it to', () => {
    const out = pasteObjects(
      clip({
        objects: [],
        placements: [{ id: 'pl_1', smartObjectId: 'so_gone', memberIds: [] }],
        connectors: [{ from: 'pl_1', to: 'campaign' }],
      }),
      AT,
    )
    expect(out.connectors).toEqual([])
  })

  it('leaves a surviving placement’s own wire alone', () => {
    const out = pasteObjects(
      clip({
        objects: [obj('co_1')],
        placements: [{ id: 'pl_1', smartObjectId: 'so_here', memberIds: ['co_1'] }],
        connectors: [{ from: 'pl_1', to: 'campaign' }],
      }),
      { ...AT, knownSmartObjectIds: new Set(['so_here']) },
    )
    expect(out.connectors).toEqual([{ from: out.idMap.get('pl_1'), to: 'campaign' }])
  })
})

const row = (over: Partial<TrafficRow> = {}): TrafficRow => ({
  id: 'row_1',
  assetId: 'a1',
  assetName: 'Instagram post #1',
  mediaType: 'image',
  channel: 'instagram',
  assetType: 'feed',
  messaging: { headline: 'Same day, every day' },
  campaign: 'Relaunch',
  scheduledAt: '2026-08-10T10:00:00.000Z',
  status: 'draft',
  createdAt: 1,
  ...over,
})

const INTO = { campaign: 'Orthopedics', sameBrand: true, takenNames: NONE, anchorDay: null }

describe('pasting a channel', () => {
  it('carries the copy, which is the point of a paste', () => {
    const out = pasteRows([row()], INTO)
    expect(out.rows[0].messaging).toEqual({ headline: 'Same day, every day' })
    expect(out.rows[0].assetName).toBe('Instagram post #1')
    expect(out.rows[0].channel).toBe('instagram')
    expect(out.rows[0].assetType).toBe('feed')
  })

  it('files the assets under the campaign they were pasted into, with new ids', () => {
    const out = pasteRows([row()], INTO)
    expect(out.rows[0].campaign).toBe('Orthopedics')
    expect(out.rows[0].id).not.toBe('row_1')
    expect(out.rows[0].assetId).toBe('')
  })

  /**
   * THE OTHER FAILURE THIS FILE EXISTS FOR. Everything below is the record of what happened to the
   * ORIGINAL asset, and a copy of it has had none of that happen. Enumerated one field at a time
   * rather than asserted in a loop, because the allow-list in pasteRows is the mechanism and a test
   * that only checked a couple of them would pass while the rest leaked.
   */
  it('arrives as a draft that has never run, whatever the original had become', () => {
    const out = pasteRows(
      [
        row({
          status: 'posted',
          postedAt: 1700000000000,
          approvedAt: 1700000000000,
          publishedAt: '2026-01-01T00:00:00.000Z',
          reconciledAt: 1700000000000,
          spend: { toDate: 4200, updatedAt: 1700000000000 },
          engagement: { likes: 91, comments: 12 },
          socialMetrics: { impressions: 41000 },
          metricsUpdatedAt: 1700000000000,
          sourceUrl: 'https://instagram.com/p/abc',
          source: 'social-live',
          live: { copy: { headline: 'What it actually said' }, fetchedAt: 1700000000000 },
          flightId: 'fl_old',
          reviewNote: 'Approved by legal',
          copyReviewed: true,
          figuresUsed: ['fig_1'],
          archivedAt: 1700000000000,
        }),
      ],
      INTO,
    )
    const r = out.rows[0]
    expect(r.status).toBe('draft')
    expect(r.postedAt).toBeUndefined()
    expect(r.approvedAt).toBeUndefined()
    expect(r.publishedAt).toBeUndefined()
    expect(r.reconciledAt).toBeUndefined()
    expect(r.spend).toBeUndefined()
    expect(r.engagement).toBeUndefined()
    expect(r.socialMetrics).toBeUndefined()
    expect(r.metricsUpdatedAt).toBeUndefined()
    expect(r.sourceUrl).toBeUndefined()
    expect(r.source).toBeUndefined()
    // The copy a post actually ran with is a record of what happened, not part of the plan. It stays
    // behind by the allow-list rather than by anybody remembering to delete it.
    expect(r.live).toBeUndefined()
    expect(r.flightId).toBeUndefined()
    expect(r.reviewNote).toBeUndefined()
    expect(r.copyReviewed).toBeUndefined()
    expect(r.figuresUsed).toBeUndefined()
    expect(r.archivedAt).toBeUndefined()
  })

  it('rebuilds the tracking link for the campaign it landed in', () => {
    const out = pasteRows([row({ utm: { source: 'ig', medium: 'organic', campaign: 'relaunch', content: 'x' } })], INTO)
    expect(out.rows[0].utm?.campaign).not.toBe('relaunch')
  })

  it('drops who it was written to when the brand changes', () => {
    const out = pasteRows([row({ audience: 'Clinic owners', references: [{ type: 'segment', id: 'seg_1', label: 'Clinic owners' }] })], {
      ...INTO,
      sameBrand: false,
    })
    expect(out.rows[0].audience).toBeUndefined()
    expect(out.rows[0].references).toBeUndefined()
    expect(out.unlinked).toBe(1)
  })

  /**
   * Assets link to each other BY NAME, so a duplicate name is not cosmetic: it makes every branchOf
   * and linksTo in the campaign ambiguous, and the canvas draws the journey to whichever it finds
   * first. Pasting back into the campaign a thing came from is the ordinary way to reach that.
   */
  it('renames around a name the target campaign already uses', () => {
    const out = pasteRows([row()], { ...INTO, takenNames: new Set(['Instagram post #1']) })
    expect(out.rows[0].assetName).toBe('Instagram post #1 (2)')
  })

  it('keeps a journey link inside the copy, pointed at the renamed asset', () => {
    const out = pasteRows(
      [row({ id: 'row_1', assetName: 'Teaser', scheduledAt: '2026-08-10T10:00:00.000Z' }),
       row({ id: 'row_2', assetName: 'Follow-up', branchOf: 'Teaser', scheduledAt: '2026-08-12T10:00:00.000Z' })],
      { ...INTO, takenNames: new Set(['Teaser']) },
    )
    expect(out.rows[0].assetName).toBe('Teaser (2)')
    expect(out.rows[1].branchOf).toBe('Teaser (2)')
  })

  /**
   * The dangerous half of the same rule. A name that was not copied means either nothing in this
   * campaign, or a DIFFERENT asset that happens to share the name — and silently branching a pasted
   * post off a stranger is worse than arriving unlinked.
   */
  it('drops a journey link whose other end did not come', () => {
    const out = pasteRows([row({ branchOf: 'Some other campaign asset', linksTo: 'A page over there' })], INTO)
    expect(out.rows[0].branchOf).toBeUndefined()
    expect(out.rows[0].linksTo).toBeUndefined()
  })

  /**
   * Asserted in LOCAL time because that is what the shift is defined in — the distance between two
   * local midnights — and it is what a person means by "the same day, at the same time".
   */
  it('re-anchors the cadence instead of importing another campaign calendar', () => {
    const at = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h, 0, 0, 0).toISOString()
    const out = pasteRows(
      [row({ id: 'row_1', assetName: 'A', scheduledAt: at(2026, 7, 10, 10) }),
       row({ id: 'row_2', assetName: 'B', scheduledAt: at(2026, 7, 17, 14) })],
      { ...INTO, anchorDay: new Date(2026, 8, 1, 9, 30).getTime() },
    )
    const a = new Date(out.rows[0].scheduledAt)
    const b = new Date(out.rows[1].scheduledAt)
    // The earliest lands on the anchor DAY, not at the anchor's time of day.
    expect([a.getFullYear(), a.getMonth(), a.getDate()]).toEqual([2026, 8, 1])
    // Every asset keeps the hour it was written for. Anchoring to an instant put them all at
    // midnight, which is a worse answer than the wrong date was.
    expect(a.getHours()).toBe(10)
    expect(b.getHours()).toBe(14)
    // Seven days apart before, seven days apart after.
    expect([b.getFullYear(), b.getMonth(), b.getDate()]).toEqual([2026, 8, 8])
  })

  /**
   * The reason the shift is rebuilt per asset rather than applied as one millisecond offset. An
   * offset measured from the first asset is an hour wrong for every asset on the other side of a
   * daylight-saving change from it, and a 9am post quietly becoming a 10am post is exactly the kind
   * of thing nobody checks.
   *
   * The shape that catches it: the run STRADDLES the change (20 Oct and 10 Nov, either side of the
   * US DST end on 1 Nov) and the anchor is past it too. A single offset then carries the extra hour
   * that only the first asset needed. Verified against the old arithmetic, which put the second
   * asset at 10:00.
   *
   * Only bites in a zone that observes daylight saving; in UTC it passes without proving anything,
   * which is the right way round for a test whose subject is a real-world calendar.
   */
  it('keeps the hour on both sides of a daylight-saving change', () => {
    const at = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h, 0, 0, 0).toISOString()
    const out = pasteRows(
      [row({ id: 'row_1', assetName: 'A', scheduledAt: at(2026, 9, 20, 9) }),
       row({ id: 'row_2', assetName: 'B', scheduledAt: at(2026, 10, 10, 9) })],
      { ...INTO, anchorDay: new Date(2026, 11, 1, 16, 0).getTime() },
    )
    expect(new Date(out.rows[0].scheduledAt).getHours()).toBe(9)
    expect(new Date(out.rows[1].scheduledAt).getHours()).toBe(9)
    // And the 21-day gap between them is still 21 days.
    const days = (a: string, b: string) => {
      const x = new Date(a); x.setHours(0, 0, 0, 0)
      const y = new Date(b); y.setHours(0, 0, 0, 0)
      return Math.round((y.getTime() - x.getTime()) / 86_400_000)
    }
    expect(days(out.rows[0].scheduledAt, out.rows[1].scheduledAt)).toBe(21)
  })

  it('leaves the dates alone when it is a duplicate in the same campaign', () => {
    const out = pasteRows([row()], INTO)
    expect(out.rows[0].scheduledAt).toBe('2026-08-10T10:00:00.000Z')
  })

  it('keeps a planned budget but not the old flight deadline', () => {
    const out = pasteRows([row({ budget: { amount: 500, type: 'lifetime', endDate: '2026-08-30' } })], INTO)
    expect(out.rows[0].budget).toEqual({ amount: 500, type: 'lifetime' })
  })

  it('reports what a copied channel is called on the other side', () => {
    const out = pasteRows([row({ branchOf: 'Gone' })], INTO)
    // The parent did not come, so the key it carried does not either.
    expect(out.keyMap.get('instagram|feed|↳Gone')).toBe('instagram|feed')
  })
})

describe('describing what is on the clipboard', () => {
  it('counts a channel as a channel, not as its posts', () => {
    const c = clip({
      objects: [obj('co_1')],
      rows: [row({ id: 'row_1' }), row({ id: 'row_2' })],
      delivKeys: ['instagram|feed'],
    })
    expect(describeClipboard(c)).toBe('1 card and 1 channel')
  })

  it('counts a post that came on its own', () => {
    const c = clip({ rows: [row({ id: 'row_1', channel: 'blog', assetType: 'article' })] })
    expect(describeClipboard(c)).toBe('1 post')
  })
})
