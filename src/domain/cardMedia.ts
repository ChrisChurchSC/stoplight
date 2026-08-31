/**
 * THE FINISHED CREATIVE, ATTACHED TO THE CARD THAT DESCRIBES IT.
 *
 * An output card already holds everything true of one post except the post itself: the copy
 * (messaging), the channel, the audience, the schedule, the controls it owes the journey. The
 * artwork was the one thing that lived somewhere else — a Drive folder, a Slack thread, an email —
 * so the person assembling a campaign had to hold the join in their head.
 *
 * WHY THE CARD OWNS THE FILE rather than the library owning it and the card pointing at it. Those
 * read as two designs and are one: the card IS the record a library lists. Attaching here means the
 * copy and the creative cannot drift apart, cannot be filed to different campaigns, and cannot be
 * deleted independently — and a library that reads rows still sees every file, because every file
 * is on a row.
 *
 * A LIST, NOT A FIELD. Carousels are the common case, not the exception: three statics and a cover,
 * six frames of a Reel, a static plus its 9:16 crop. Order is the array's order, because for a
 * carousel the order IS content — slide one is the hook.
 *
 * THE BYTES ARE NOT IN HERE. This is metadata only, small enough to ride the workspace state mirror
 * alongside everything else the app syncs. The file itself goes to object storage; `path` is the
 * receipt. See adapters/media/creativeStore.
 */

/** What the file IS, for the shape of its tile. Coarser than MIME on purpose: the tile has only
 *  three faces — a picture, a picture with a play badge, and a page. */
export type CreativeKind = 'image' | 'video' | 'doc'

export interface CardMedia {
  id: string
  /** The filename as uploaded. Kept verbatim: "hero_v4_FINAL.png" is how someone will ask for it. */
  name: string
  mime: string
  size: number
  kind: CreativeKind
  /** Pixel dimensions (image/video) and duration (video), read on ingest. Shown on the tile so a
   *  reviewer can see a 1080×1080 was handed to a channel that wanted 9:16 without opening it. */
  width?: number
  height?: number
  durationSec?: number
  /**
   * Object path in the `creative` bucket, set once the bytes reach the workspace.
   *
   * ABSENT MEANS THIS DEVICE ONLY, and the tile says so. That distinction is the whole reason this
   * field is optional rather than assumed: a file that uploaded into a browser and never reached the
   * workspace looks identical to one that did, right up until the person who needs it opens the
   * campaign on their own machine and finds an empty card.
   */
  path?: string
  uploadedAt: number
  /** Display name at upload time, captured rather than looked up — the same rule the comment thread
   *  follows, and for the same reason: it should still read correctly after they leave. */
  uploadedBy?: string
}

export const freshMediaId = (): string =>
  `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

const IMAGE_RE = /^image\//i
const VIDEO_RE = /^video\//i
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|heic|heif)$/i
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi|mkv)$/i

/**
 * MIME first, extension second. A file dragged out of some tools arrives with an empty `type` — the
 * browser only guesses from extensions it recognises — and a .mov with no MIME rendering as a
 * document is a video you cannot preview.
 */
export function creativeKind(mime: string, name: string): CreativeKind {
  if (IMAGE_RE.test(mime)) return 'image'
  if (VIDEO_RE.test(mime)) return 'video'
  if (IMAGE_EXT.test(name)) return 'image'
  if (VIDEO_EXT.test(name)) return 'video'
  return 'doc'
}

/** The file extension, for the storage object's own name. Lowercased, no dot, '' when there is none. */
export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name)
  return m ? m[1].toLowerCase() : ''
}

/** Bytes at the precision a person reads: "412 KB", "3.4 MB". Never "3.40 MB". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

/** A video's length as m:ss. An unknown duration answers '' rather than "0:00", which is a claim. */
export function formatDuration(sec: number | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "1080 × 1350 · 412 KB", skipping whatever is unknown. The tile's one line of fact. */
export function creativeMeta(m: CardMedia): string {
  const bits: string[] = []
  if (m.width && m.height) bits.push(`${m.width} × ${m.height}`)
  const dur = formatDuration(m.durationSec)
  if (dur) bits.push(dur)
  bits.push(formatBytes(m.size))
  return bits.join(' · ')
}

/**
 * Move one item to a new index, returning a new array.
 *
 * Clamped rather than guarded: the buttons that call this are disabled at the ends, but a held key
 * can outrun a re-render, and an out-of-range splice silently drops the item off the list — which
 * for a carousel means a slide that vanishes when you press "up" one time too many.
 */
export function moveMedia(list: CardMedia[], id: string, to: number): CardMedia[] {
  const from = list.findIndex((m) => m.id === id)
  if (from < 0) return list
  const target = Math.max(0, Math.min(list.length - 1, to))
  if (target === from) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(target, 0, item)
  return next
}

/**
 * WHAT THE SECTION HEADER SAYS ABOUT WHAT IS ATTACHED.
 *
 * Counting is not enough: "3 files" and "3 slides" are different facts, and the second is the one a
 * campaign manager is checking. Two or more images on one card is a carousel — that is what a
 * carousel is — so the header names it rather than making them count tiles.
 */
export function creativeSummary(list: CardMedia[]): string {
  if (!list.length) return ''
  const images = list.filter((m) => m.kind === 'image').length
  const videos = list.filter((m) => m.kind === 'video').length
  const docs = list.length - images - videos
  if (list.length > 1 && images === list.length) return `Carousel · ${images} slides`
  const bits: string[] = []
  if (images) bits.push(`${images} image${images > 1 ? 's' : ''}`)
  if (videos) bits.push(`${videos} video${videos > 1 ? 's' : ''}`)
  if (docs) bits.push(`${docs} file${docs > 1 ? 's' : ''}`)
  return bits.join(' · ')
}

/** Files still only on this device — the count the section warns about. */
export const unsyncedCount = (list: CardMedia[]): number => list.filter((m) => !m.path).length
