import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLivePost, youtubeVideoId } from '../livePost'

/**
 * WHAT CAN BE READ OFF A LINK, AND WHAT HONESTLY CANNOT.
 *
 * The value of this reader is as much in its refusals as in its reads. A pasted URL gives you a
 * YouTube video's words and a web page's words, and gives you nothing at all on Instagram or
 * LinkedIn, where a post's text is only ever shown to the account that owns it (docs/social-oauth.md).
 * A reader that spun and failed on those — or worse, returned something plausible it had guessed —
 * would be worse than one that names the connection and lets you type it in.
 *
 * The network is stubbed rather than reached: what is being pinned is the routing and the shape of
 * the answer, and a test that called YouTube would be testing YouTube.
 */

const ORIGINAL_FETCH = globalThis.fetch
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  delete process.env.YOUTUBE_API_KEY
  vi.restoreAllMocks()
})

describe('finding the video in a YouTube link', () => {
  it('reads all four shapes YouTube hands out', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeVideoId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('survives the parameters a share sheet adds', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&si=abc')).toBe('dQw4w9WgXcQ')
  })

  /** A channel or a playlist is a YouTube URL with no video in it, which is a real answer. */
  it('is not a video', () => {
    expect(youtubeVideoId('https://www.youtube.com/@bigbuoy')).toBeNull()
    expect(youtubeVideoId('https://www.youtube.com/playlist?list=PL123')).toBeNull()
    expect(youtubeVideoId('https://vimeo.com/12345')).toBeNull()
    expect(youtubeVideoId('not a url')).toBeNull()
  })

  /** An id is exactly eleven of a known alphabet; anything else is a path we have misread. */
  it('refuses something that is not an id', () => {
    expect(youtubeVideoId('https://youtu.be/short')).toBeNull()
  })
})

describe('reading a post back from its link', () => {
  it('names the connection that would read an Instagram post, rather than failing', async () => {
    const out = await readLivePost('https://www.instagram.com/p/abc123/')
    expect(out).toEqual({ available: false, reason: 'connect-instagram' })
  })

  it('does the same for the other platforms that gate their own posts', async () => {
    expect((await readLivePost('https://linkedin.com/posts/bigbuoy-123')).reason).toBe('connect-linkedin')
    expect((await readLivePost('https://x.com/bigbuoy/status/1')).reason).toBe('connect-x')
    expect((await readLivePost('https://tiktok.com/@bigbuoy/video/1')).reason).toBe('connect-tiktok')
  })

  /** A deployment fact, not a fault in the link, and the sentence the caller writes differs. */
  it('says YouTube is not connected when there is no key', async () => {
    const out = await readLivePost('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(out).toEqual({ available: false, reason: 'no-youtube-key' })
  })

  it('reads a video’s title and description when it is', async () => {
    process.env.YOUTUBE_API_KEY = 'k'
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [{ snippet: { title: 'Hurricane prep in 60 seconds', description: 'What to do first.', publishedAt: '2026-08-01T00:00:00Z' } }],
      }),
    })) as never
    const out = await readLivePost('https://youtu.be/dQw4w9WgXcQ')
    expect(out).toMatchObject({
      available: true,
      via: 'youtube',
      title: 'Hurricane prep in 60 seconds',
      body: 'What to do first.',
      publishedAt: '2026-08-01T00:00:00Z',
    })
  })

  it('reports a video YouTube does not have', async () => {
    process.env.YOUTUBE_API_KEY = 'k'
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })) as never
    expect((await readLivePost('https://youtu.be/dQw4w9WgXcQ')).reason).toBe('youtube-not-found')
  })

  it('says a YouTube link with no video in it is not one', async () => {
    process.env.YOUTUBE_API_KEY = 'k'
    expect((await readLivePost('https://www.youtube.com/@bigbuoy')).reason).toBe('youtube-not-a-video')
  })

  /** A landing page or a case study is a live asset too, and the only one needing no key at all. */
  it('reads a web page with no key of any kind', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => '<html><head><title>Hurricane prep guide</title><meta name="description" content="Everything to do before it lands."></head><body><p>Body copy here.</p></body></html>',
    })) as never
    const out = await readLivePost('https://bigbuoy.com/guides/hurricane-prep')
    expect(out).toMatchObject({ available: true, via: 'page', title: 'Hurricane prep guide' })
    expect(out.body).toContain('Everything to do before it lands.')
  })

  it('reports a page that does not answer', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, headers: { get: () => 'text/html' }, text: async () => '' })) as never
    expect((await readLivePost('https://bigbuoy.com/gone')).reason).toBe('page-unreachable')
  })

  it('is not a link at all', async () => {
    expect((await readLivePost('   ')).reason).toBe('unreadable-url')
  })
})
