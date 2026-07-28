import type { ChannelId } from './types'

/**
 * Library folders — brand-scoped buckets that sit alongside a brand's own ingested
 * content in the Library. The first use is a competitor's body of work: file "Salt
 * Strong" or "BlacktipH" in their own folder, add items by pasting post/video URLs or
 * by hand, and browse them beside your own catalog for reference.
 *
 * Deliberately self-contained: a folder owns its items as lightweight records, kept
 * out of the campaign/row machinery (those are things you PLAN and SHIP — competitor
 * content is reference material). Persisted as a plain array in localStorage.
 */

/** One item in a folder — a single competitor post, video, or page. */
export interface LibraryFolderItem {
  id: string
  title: string
  /** Publishing channel, if known (youtube / instagram / …). Inferred from the URL. */
  channel?: ChannelId
  url?: string
  /** The post copy / notes, shown on the card and in the detail view. */
  copy?: string
  addedAt: number
}

/** The shape accepted when adding items — title is optional (derived from the URL if omitted). */
export type LibraryFolderItemInput = { title?: string; channel?: ChannelId; url?: string; copy?: string }

/** A folder of reference content, scoped to a brand's workspace. */
export interface LibraryFolder {
  id: string
  /** Which brand's Library this folder lives under (scoped by the rail). */
  brand: string
  name: string
  /** What the folder holds — a competitor's content, or a free-form collection. */
  kind: 'competitor' | 'collection'
  createdAt: number
  items: LibraryFolderItem[]
}

let seq = 0
const rid = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`
export const freshFolderId = () => rid('lf')
export const freshFolderItemId = () => rid('li')

const HOST_CHANNEL: [RegExp, ChannelId][] = [
  [/youtube\.com|youtu\.be/i, 'youtube'],
  [/instagram\.com/i, 'instagram'],
  [/tiktok\.com/i, 'tiktok'],
  [/linkedin\.com/i, 'linkedin'],
  [/(twitter\.com|x\.com)/i, 'x'],
  [/facebook\.com|fb\.com|fb\.watch/i, 'facebook'],
  [/pinterest\./i, 'pinterest'],
]

/** Infer a publishing channel from a URL's host; falls back to a generic website. */
export function channelFromUrl(url: string): ChannelId {
  for (const [re, ch] of HOST_CHANNEL) if (re.test(url)) return ch
  return 'website'
}

/** A readable title from a URL when the user didn't give one: host + last path segment. */
export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`)
    const host = u.hostname.replace(/^www\./, '')
    const seg = u.pathname.split('/').filter(Boolean).pop() ?? ''
    const tail = decodeURIComponent(seg).replace(/[-_]+/g, ' ').replace(/\.\w+$/, '').trim()
    return tail ? `${host} · ${tail}`.slice(0, 80) : host
  } catch {
    return url.slice(0, 80)
  }
}

/** Split a pasted block into individual URLs (one per line or whitespace-separated). */
export function parseUrls(block: string): string[] {
  return block
    .split(/[\s\n]+/)
    .map((s) => s.trim())
    .filter((s) => /^(https?:\/\/|www\.)|\.\w{2,}\//i.test(s) || /^https?:\/\//i.test(s))
}
