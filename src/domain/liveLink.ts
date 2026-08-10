import { platformToChannel } from './importAssets'
import type { ChannelId, TrafficRow } from './types'

/**
 * ATTACHING A CARD TO THE POST IT BECAME — everything that has to be true before the row is written.
 *
 * The link is the act that makes a planned card live, so it is the one place to catch the three ways
 * it goes wrong, and all three are quiet failures rather than errors:
 *
 *   a URL already on another row  → two records of one post, and every count of it doubles
 *   a URL from another platform   → an Instagram post filed as LinkedIn, which then reads its
 *                                   metrics from the wrong connection forever
 *   a URL that is not a post      → a profile, a shortlink, a bare domain: attaches fine, reads as
 *                                   empty forever, and looks like the fetch failed
 *
 * Pure and separate from the store because each one is a sentence somebody has to be shown before
 * anything is written, and a refusal that arrives after the row has changed is not a refusal.
 *
 * See docs/live-asset-mode-plan.md.
 */

/** Hosts we can name a channel for. Anything else is a web surface, which is a real answer. */
const HOST_PLATFORM: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/i, 'instagram'],
  [/(^|\.)facebook\.com$/i, 'facebook'],
  [/(^|\.)linkedin\.com$/i, 'linkedin'],
  [/(^|\.)(x|twitter)\.com$/i, 'x'],
  [/(^|\.)tiktok\.com$/i, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, 'youtube'],
  [/(^|\.)pinterest\.(com|[a-z]{2})$/i, 'pinterest'],
]

/**
 * The paths each platform hands out for ONE POST, as opposed to a profile or a feed. Deliberately
 * permissive: a pattern that refuses a real post is worse than one that accepts a profile, because
 * the first blocks work and the second is a warning the person can overrule.
 */
const POST_PATH: Record<string, RegExp> = {
  instagram: /^\/(p|reel|reels|tv)\/[^/]+/i,
  facebook: /\/(posts|videos|reel|permalink\.php|story\.php)/i,
  linkedin: /\/(posts|feed\/update|pulse)\//i,
  x: /\/status\/\d+/i,
  tiktok: /\/video\/\d+/i,
  youtube: /(^\/watch$|^\/shorts\/|^\/live\/|^\/[\w-]{11}$)/i,
  pinterest: /^\/pin\//i,
}

export interface LiveLink {
  /** The URL as it will be stored: trimmed, https, no tracking junk, no trailing slash. */
  url: string
  /** The platform the host names, when it names one. */
  platform?: string
  /** The channel that platform maps to, for comparing against the card's own. */
  channel?: ChannelId
  /** Does the path look like one post rather than a profile or a feed? */
  looksLikePost: boolean
}

/**
 * Everything stripped is a parameter that identifies the VISIT rather than the post, which is what
 * makes two people pasting the same post produce two different strings — and sourceUrl is the dedup
 * key, so that is a duplicate record of one post. `igshid` and `si` are the share-sheet's, `fbclid`
 * and `gclid` are the ad platforms', `utm_*` are ours.
 */
const TRACKING = /^(utm_|fbclid$|gclid$|igshid$|igsh$|si$|ref$|ref_src$|ref_url$|mc_cid$|mc_eid$)/i

/** Parse and normalize a pasted link. Null when it is not a URL at all. */
export function readLiveLink(raw: string): LiveLink | null {
  const text = raw.trim()
  if (!text) return null
  let u: URL
  try {
    // A bare "instagram.com/p/x" is what a person pastes out of a share sheet often enough to handle.
    u = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.replace(/^www\./i, '').toLowerCase()
  if (!host.includes('.')) return null
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
  u.protocol = 'https:'
  u.hostname = host
  u.hash = ''
  const path = u.pathname.replace(/\/+$/, '') || '/'
  u.pathname = path
  const platform = HOST_PLATFORM.find(([re]) => re.test(host))?.[1]
  const rule = platform ? POST_PATH[platform] : undefined
  return {
    url: u.toString().replace(/\/$/, ''),
    platform,
    channel: platform ? platformToChannel(platform) : undefined,
    // A web surface is a legitimate live asset (a landing page, a case study) and every path on one
    // is "the post", so only the platforms with a shape to check get checked.
    looksLikePost: rule ? rule.test(path) : true,
  }
}

export type LinkRefusal =
  | { kind: 'unreadable' }
  | { kind: 'not-a-post'; link: LiveLink }
  | { kind: 'wrong-channel'; link: LiveLink; linkChannel: ChannelId; cardChannel: ChannelId }

export interface LinkVerdict {
  link: LiveLink
  /** What to say before writing anything. Absent when the link is unambiguous. */
  refusal?: LinkRefusal
  /**
   * THE OTHER ASSETS ON THIS SAME URL. Reported, never refused.
   *
   * This was a hard refusal, on the reasoning that two rows carrying one URL doubles every count of
   * it. That reasoning was about a fault the app does not actually have — metrics are read per row,
   * for sorting and for one asset's own panel, not summed into a brand total — and it was blocking
   * the ordinary case: one page is the destination of ten posts, a landing page serves every
   * campaign that points at it, and a brand's own pages are already in the library because the site
   * ingest put them there. An asset could not be told what it plainly was.
   *
   * So it is context now. Knowing the page is also on four other cards is worth saying; deciding on
   * somebody's behalf that it may not be on a fifth is not.
   */
  alsoOn: TrafficRow[]
}

/**
 * Read a pasted link against the campaign it is being attached inside.
 *
 * EVERY REFUSAL HERE IS A QUESTION. Both are overrulable because both have honest reasons to be
 * wrong: a platform ships a URL shape we have not seen, or the card's channel is the thing that
 * needs correcting rather than the link. Nothing here is a wall — the one thing that was, the
 * duplicate, is reported as `alsoOn` instead. See the note on it.
 */
export function readLinkFor(
  raw: string,
  card: Pick<TrafficRow, 'id' | 'channel'>,
  rows: readonly TrafficRow[],
): LinkVerdict | { link: null; refusal: { kind: 'unreadable' } } {
  const link = readLiveLink(raw)
  if (!link) return { link: null, refusal: { kind: 'unreadable' } }

  const alsoOn = rows.filter((r) => r.id !== card.id && !r.archivedAt && r.sourceUrl?.trim() === link.url)

  if (!link.looksLikePost) return { link, alsoOn, refusal: { kind: 'not-a-post', link } }

  if (link.channel && link.channel !== card.channel) {
    return { link, alsoOn, refusal: { kind: 'wrong-channel', link, linkChannel: link.channel, cardChannel: card.channel as ChannelId } }
  }
  return { link, alsoOn }
}
