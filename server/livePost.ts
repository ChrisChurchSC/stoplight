import { readLiveLink } from '../src/domain/liveLink.js'
import { fetchPage } from './ingestSiteHandler.js'

/**
 * READ BACK WHAT A PUBLISHED POST ACTUALLY SAYS, from its URL alone.
 *
 * Phase 2 of docs/live-asset-mode-plan.md. The Active face lets you type the copy in by hand and
 * always will; this is the half that can be done for you, and it is deliberately only the half that
 * genuinely can.
 *
 * WHAT IS AND IS NOT POSSIBLE. docs/social-oauth.md states it: there is no free, no-login way to
 * read someone else's Instagram or LinkedIn, and the legitimate path is the client connecting their
 * own account. So this reads exactly two things and refuses the rest by name:
 *
 *   a YouTube video   → title and description, via the Data API's public key. No OAuth.
 *   any web page      → title and description off the page itself. A landing page, a case study,
 *                       a blog post: all real live assets, all readable, none of them needing a
 *                       platform app.
 *   everything else   → `available: false` with the connection that would fix it, so the panel says
 *                       "connect Instagram to read this back" rather than spinning and failing.
 *
 * METRICS ARE NOT HERE, and that is not an omission. Insights for a post are only ever available to
 * the account that owns it, on every platform including YouTube. Numbers stay typed in until an
 * account is connected (phase 3), and a reader that returned a plausible-looking number it had
 * guessed would be worse than one that returns none.
 *
 * The platform table is domain/liveLink.ts, shared rather than restated: the client decides whether
 * a link is a post before it is attached, and this decides what can be read off it, and the two
 * disagreeing about what an instagram.com URL is would be a bug nobody could see.
 */

export interface LivePostRead {
  available: boolean
  /** Why not, when not: a platform key the caller turns into a sentence. */
  reason?: string
  title?: string
  body?: string
  /** ISO, where the source states one. */
  publishedAt?: string
  /** Which route answered, so the panel can say where the words came from. */
  via?: 'youtube' | 'page'
}

/** The platforms whose posts are only readable through the account that owns them. */
const NEEDS_ACCOUNT = new Set(['instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'pinterest'])

/**
 * A video id out of any of the four shapes YouTube hands out. Exported for its own test: it is pure
 * string work, it is the part that silently returns the wrong thing when a URL shape changes, and
 * testing it through a network call would test the network.
 */
export function youtubeVideoId(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\./i, '').toLowerCase()
  const id = (v: string | null | undefined) => (v && /^[\w-]{11}$/.test(v) ? v : null)
  if (host === 'youtu.be') return id(u.pathname.slice(1).split('/')[0])
  if (host !== 'youtube.com' && host !== 'm.youtube.com') return null
  if (u.pathname === '/watch') return id(u.searchParams.get('v'))
  const m = /^\/(shorts|live|embed|v)\/([\w-]{11})/.exec(u.pathname)
  return m ? id(m[2]) : null
}

async function readYouTubeVideo(videoId: string): Promise<LivePostRead> {
  const key = process.env.YOUTUBE_API_KEY
  // A missing key is a deployment fact, not a fault in the link, and the sentence differs.
  if (!key) return { available: false, reason: 'no-youtube-key' }
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${key}`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return { available: false, reason: `youtube-${res.status}` }
    const item = ((await res.json()) as { items?: { snippet?: { title?: string; description?: string; publishedAt?: string } }[] })
      .items?.[0]?.snippet
    if (!item) return { available: false, reason: 'youtube-not-found' }
    return {
      available: true,
      via: 'youtube',
      title: (item.title ?? '').trim() || undefined,
      body: (item.description ?? '').trim() || undefined,
      publishedAt: item.publishedAt,
    }
  } catch {
    return { available: false, reason: 'youtube-unreachable' }
  }
}

export async function readLivePost(raw: string): Promise<LivePostRead> {
  const link = readLiveLink(raw)
  if (!link) return { available: false, reason: 'unreadable-url' }

  if (link.platform === 'youtube') {
    const id = youtubeVideoId(link.url)
    // A YouTube URL that is not one video — a channel, a playlist — has nothing to read back.
    return id ? await readYouTubeVideo(id) : { available: false, reason: 'youtube-not-a-video' }
  }
  if (link.platform && NEEDS_ACCOUNT.has(link.platform)) {
    return { available: false, reason: `connect-${link.platform}` }
  }

  // No platform means a web surface, which is a first-class live asset and the one thing here that
  // needs no key at all.
  const page = await fetchPage(link.url)
  if (!page) return { available: false, reason: 'page-unreachable' }
  return {
    available: true,
    via: 'page',
    title: page.title?.trim() || undefined,
    body: (page.description?.trim() || page.text?.trim().slice(0, 1200)) || undefined,
  }
}
