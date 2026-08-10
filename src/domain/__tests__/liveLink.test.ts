import { describe, expect, it } from 'vitest'
import { readLinkFor, readLiveLink } from '../liveLink'
import type { TrafficRow } from '../types'

/**
 * THE LINK IS THE ACT THAT MAKES A CARD LIVE, so it is the one place to catch the three ways it
 * goes wrong — and all three are quiet: nothing throws, the row is written, and the fault turns up
 * later as a number counted twice, a card reading its metrics off the wrong connection, or a panel
 * that stays empty forever and looks like a failed fetch.
 *
 * Normalization is not cosmetic here. sourceUrl is the dedup key the whole import path already turns
 * on, so two people pasting the same post out of two share sheets have to produce one string.
 */

const row = (over: Partial<TrafficRow> = {}): TrafficRow => ({
  id: 'r1',
  assetId: '',
  assetName: 'Storm reel',
  mediaType: 'video',
  channel: 'instagram',
  messaging: {},
  scheduledAt: '2026-09-01T10:00:00.000Z',
  status: 'draft',
  createdAt: 0,
  ...over,
}) as TrafficRow

describe('reading a pasted link', () => {
  it('names the platform and the channel it belongs to', () => {
    expect(readLiveLink('https://www.instagram.com/reel/Cx123/')).toMatchObject({
      platform: 'instagram',
      channel: 'instagram',
      looksLikePost: true,
    })
  })

  /** What a share sheet actually hands you: tracking that identifies the VISIT, not the post. */
  it('strips the parameters that would make one post look like two', () => {
    const a = readLiveLink('https://instagram.com/p/abc/?igshid=XYZ&utm_source=ig_web')
    const b = readLiveLink('https://www.instagram.com/p/abc?fbclid=123')
    expect(a?.url).toBe('https://instagram.com/p/abc')
    expect(b?.url).toBe(a?.url)
  })

  it('takes a link pasted without its scheme', () => {
    expect(readLiveLink('instagram.com/p/abc')?.url).toBe('https://instagram.com/p/abc')
  })

  it('is not a link', () => {
    expect(readLiveLink('   ')).toBeNull()
    expect(readLiveLink('just some words')).toBeNull()
    expect(readLiveLink('javascript:alert(1)')).toBeNull()
  })

  /** A profile is a URL and is not a post. It attaches fine and then reads as empty forever. */
  it('tells one post apart from a profile or a feed', () => {
    expect(readLiveLink('https://instagram.com/bigbuoy')?.looksLikePost).toBe(false)
    expect(readLiveLink('https://instagram.com/p/abc')?.looksLikePost).toBe(true)
    expect(readLiveLink('https://x.com/bigbuoy/status/123')?.looksLikePost).toBe(true)
    expect(readLiveLink('https://linkedin.com/company/bigbuoy')?.looksLikePost).toBe(false)
  })

  /**
   * A landing page or a case study is a legitimate live asset and every path on one is "the post",
   * so a web surface is never refused for its shape. Only platforms with a known shape get checked.
   */
  it('accepts any path on a web surface', () => {
    const page = readLiveLink('https://bigbuoy.com/guides/hurricane-prep')
    expect(page).toMatchObject({ platform: undefined, looksLikePost: true })
  })
})

describe('attaching it to a card', () => {
  const other = row({ id: 'r2', assetName: 'The one already attached', sourceUrl: 'https://instagram.com/p/abc' })

  /**
   * ONE PAGE, MANY CARDS. This used to be a hard refusal, on the reasoning that two rows carrying
   * one URL doubles every count of it — a fault the app does not have, since metrics are read per
   * row rather than summed into a total. What it did have was a blocked user: one page is the
   * destination of ten posts, and a brand's own pages are in the library already because the site
   * ingest put them there, so an asset could not be told what it plainly was.
   */
  it('reports the other assets on the same link, and does not refuse it', () => {
    const v = readLinkFor('https://www.instagram.com/p/abc/?igshid=1', row(), [row(), other])
    expect(v.refusal).toBeUndefined()
    expect(v.link && v.alsoOn.map((r) => r.assetName)).toEqual(['The one already attached'])
  })

  /** An archived twin is not a record of anything, so it is not worth mentioning either. */
  it('leaves an archived twin out of the count', () => {
    const v = readLinkFor('https://instagram.com/p/abc', row(), [row(), { ...other, archivedAt: 1 }])
    expect(v.link && v.alsoOn).toEqual([])
  })

  /** The card's own link is not another asset. */
  it('does not count the card itself', () => {
    const self = row({ sourceUrl: 'https://instagram.com/p/abc' })
    const v = readLinkFor('https://instagram.com/p/abc', self, [self])
    expect(v.refusal).toBeUndefined()
    expect(v.link && v.alsoOn).toEqual([])
  })

  /** One of the card and the link is wrong and only the person knows which, so it asks. */
  it('asks when the link is a different platform from the card', () => {
    const v = readLinkFor('https://linkedin.com/posts/bigbuoy-123', row({ channel: 'instagram' }), [])
    expect(v.refusal).toMatchObject({ kind: 'wrong-channel', linkChannel: 'linkedin', cardChannel: 'instagram' })
  })

  it('passes a post that matches the card it is going on', () => {
    expect(readLinkFor('https://instagram.com/reel/abc', row({ channel: 'instagram' }), []).refusal).toBeUndefined()
  })

  it('reports something that is not a link at all', () => {
    expect(readLinkFor('nonsense', row(), []).refusal).toEqual({ kind: 'unreadable' })
  })
})
