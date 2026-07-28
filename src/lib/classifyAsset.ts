import { CHANNELS, channelAccepts } from '../domain/channels'
import { isValidType, primaryTypeKey } from '../domain/channelAssetTypes'
import type { Asset, ChannelId } from '../domain/types'

/**
 * Phase-1 heuristic auto-organizer. Pure functions, no network.
 *
 * Two decisions, two different signals:
 *  - CHANNEL comes from folder-path + filename tokens (the only signal that can
 *    tell paid from organic, or Instagram from TikTok for the same 9:16 video).
 *  - TYPE comes from file type + aspect ratio + duration, validated against each
 *    channel's real taxonomy.
 *
 * The suggested type is computed PER channel (one asset → many channels, each
 * with its own type name) so whatever channel the user keeps, the right type is
 * already filled in. Channel is only auto-assigned when a folder/name token says
 * so AND the channel accepts the media type; otherwise the asset is left for the
 * user to pick, with a low confidence flag.
 */

type Family =
  | 'vertical'
  | 'square'
  | 'landscape'
  | 'wide'
  | 'carousel'
  | 'document'
  | 'text'
  | 'link'

interface Alias {
  words: string[]
  /** Channel when no paid token is present (the default / organic side). */
  base?: ChannelId
  /** Channel when a paid token (ad/paid/boost…) is present. */
  paid?: ChannelId
  /** Full platform word → high confidence; short alias → lower. */
  strong?: boolean
  /** Ambiguous alias (e.g. 'x') that must match a FOLDER token, never a
   *  filename token — so "Mockups x Final.png" doesn't get routed to X. */
  strict?: boolean
}

// Order matters only for confidence (strong wins); channels are de-duped.
const ALIASES: Alias[] = [
  { words: ['linkedin'], base: 'linkedin', paid: 'linkedin-ads', strong: true },
  { words: ['li'], base: 'linkedin', paid: 'linkedin-ads' },
  { words: ['instagram', 'insta'], base: 'instagram', paid: 'meta-ads', strong: true },
  { words: ['ig'], base: 'instagram', paid: 'meta-ads' },
  { words: ['facebook'], base: 'facebook', paid: 'meta-ads', strong: true },
  { words: ['fb'], base: 'facebook', paid: 'meta-ads' },
  { words: ['meta'], paid: 'meta-ads', base: 'meta-ads', strong: true },
  { words: ['twitter'], base: 'x', paid: 'x-ads', strong: true },
  { words: ['x'], base: 'x', paid: 'x-ads', strict: true },
  { words: ['tiktok'], base: 'tiktok', paid: 'tiktok-ads', strong: true },
  { words: ['tt'], base: 'tiktok', paid: 'tiktok-ads' },
  { words: ['youtube'], base: 'youtube', paid: 'youtube-ads', strong: true },
  { words: ['yt'], base: 'youtube', paid: 'youtube-ads' },
  { words: ['pinterest'], base: 'pinterest', paid: 'pinterest-ads', strong: true },
  { words: ['pin'], base: 'pinterest', paid: 'pinterest-ads' },
  { words: ['snapchat', 'snap'], base: 'snapchat-ads', paid: 'snapchat-ads', strong: true },
  { words: ['reddit', 'rdt'], base: 'reddit-ads', paid: 'reddit-ads', strong: true },
  { words: ['gsem', 'sem', 'rsa', 'adwords'], base: 'google-search', paid: 'google-search', strong: true },
  { words: ['search'], base: 'google-search', paid: 'google-search' },
  { words: ['pmax', 'performancemax'], base: 'pmax', paid: 'pmax', strong: true },
  { words: ['demandgen', 'dg', 'gdg'], base: 'google-demand', paid: 'google-demand', strong: true },
  { words: ['email', 'edm', 'newsletter', 'klaviyo', 'mailchimp'], base: 'email', strong: true },
  { words: ['sms'], base: 'sms', strong: true },
  { words: ['push'], base: 'push', strong: true },
  { words: ['blog'], base: 'blog', strong: true },
  { words: ['landing', 'landingpage', 'lp'], base: 'landing-page', strong: true },
  { words: ['ebook', 'whitepaper', 'leadmagnet', 'checklist', 'cheatsheet'], base: 'lead-magnet', strong: true },
]

const PAID_TOKENS = new Set(['ad', 'ads', 'paid', 'boost', 'boosted', 'promo', 'promoted', 'sponsored', 'ppc'])

const ALL_CHANNELS = Object.keys(CHANNELS) as ChannelId[]

/**
 * Tokenize a path/name into a set of candidate words to match aliases against.
 * Includes: raw separator-split tokens ('YouTube' → 'youtube'), camelCase splits
 * ('liCarousel' → 'li','carousel'), and adjacent bigrams + their singular form
 * ('Lead Magnets' → 'leadmagnets' → 'leadmagnet') so two-word folder names
 * resolve. Single tokens are deliberately NOT singularized — that would let a
 * "Pins" folder collide with the 'pin' alias.
 */
function tokenize(s: string): string[] {
  const raw = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const camel = s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const out = new Set<string>([...raw, ...camel])
  for (let i = 0; i < raw.length - 1; i++) {
    const bigram = raw[i] + raw[i + 1]
    out.add(bigram)
    if (bigram.length > 3 && bigram.endsWith('s')) out.add(bigram.slice(0, -1))
  }
  return [...out]
}

/** Strip extension + trailing index (img_01 → img) to group carousel slides. */
function stem(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[\s_-]*\d+$/, '')
    .toLowerCase()
    .trim()
}

function formatFamily(asset: Asset): Family {
  if (asset.mediaType === 'link') return 'link'
  if (asset.mimeType === 'application/pdf') return 'document'
  if (asset.mediaType === 'text') return 'text'
  const ar = asset.width && asset.height ? asset.width / asset.height : undefined
  if (ar == null) return asset.mediaType === 'video' ? 'wide' : 'square'
  if (ar < 0.8) return 'vertical'
  if (ar <= 1.25) return 'square'
  // Any horizontal video (incl. 16:9) is the duration-aware "wide" family so
  // bumpers/long-form resolve; images keep a distinct landscape band.
  if (asset.mediaType === 'video') return 'wide'
  if (ar <= 1.9) return 'landscape'
  return 'wide'
}

/** Best valid type value for a channel given the format family. Candidates are
 *  tried in priority order and validated against the channel's real taxonomy;
 *  falls back to the channel's primary type. */
function typeFor(channel: ChannelId, family: Family, asset: Asset): string {
  const isVideo = asset.mediaType === 'video'
  const dur = asset.durationSec
  let candidates: string[]
  switch (family) {
    case 'carousel':
      candidates = ['carousel', 'photo', 'document']
      break
    case 'vertical':
      candidates = isVideo
        ? ['reel', 'short', 'in-feed', 'story', 'video', 'idea']
        : ['story', 'idea', 'reel', 'feed', 'standard', 'single-image', 'image']
      break
    case 'square':
      candidates = isVideo
        ? ['video', 'in-feed', 'feed', 'reel']
        : ['feed', 'single-image', 'image', 'standard']
      break
    case 'landscape':
      candidates = isVideo
        ? ['video', 'in-feed', 'long-form', 'single-image']
        : ['single-image', 'image', 'feed', 'standard', 'article']
      break
    case 'wide':
      candidates = isVideo
        ? dur != null && dur <= 6
          ? ['bumper', 'video', 'skippable', 'long-form']
          : dur != null && dur >= 180
            ? ['long-form', 'skippable', 'video']
            : ['video', 'long-form', 'skippable', 'in-feed']
        : ['single-image', 'image', 'long-form', 'article']
      break
    case 'document':
      candidates = ['document', 'ebook', 'pillar', 'whitepaper', 'case-study']
      break
    case 'text':
      candidates = ['article', 'newsletter', 'text', 'promotional', 'long-form']
      break
    case 'link':
      candidates = ['lead-capture', 'link', 'text', 'sales']
      break
  }
  for (const c of candidates) if (isValidType(channel, c)) return c
  // Media-appropriate safety net before the channel's primary type — which may
  // be video-only (e.g. tiktok-ads → 'in-feed'), so a still image must not fall
  // through to it.
  const generic = isVideo
    ? ['video', 'reel', 'short', 'in-feed', 'long-form']
    : ['single-image', 'image', 'feed', 'standard', 'carousel', 'photo', 'idea', 'article']
  for (const c of generic) if (isValidType(channel, c)) return c
  if (isValidType(channel, 'other')) return 'other'
  return primaryTypeKey(channel)
}

/** Stable key for grouping carousel slides: folder-scoped so two unrelated
 *  camera-roll exports in different folders can't collide. */
function stemKey(asset: Asset): string {
  return `${asset.folderPath ?? ''}::${stem(asset.name)}`
}

/** Resolve channels named by folder/filename tokens, paid-aware, media-filtered.
 *  Strict aliases ('x') only match FOLDER tokens, never filename tokens. */
function resolveChannels(asset: Asset): { channels: ChannelId[]; strong: boolean } {
  const folderTokens = new Set(tokenize(asset.folderPath ?? ''))
  const allTokens = new Set(tokenize(`${asset.folderPath ?? ''} ${asset.name}`))
  const paid = [...allTokens].some((t) => PAID_TOKENS.has(t))
  const found: ChannelId[] = []
  let strong = false
  for (const a of ALIASES) {
    const pool = a.strict ? folderTokens : allTokens
    if (!a.words.some((w) => pool.has(w))) continue
    const ch = paid ? (a.paid ?? a.base) : (a.base ?? a.paid)
    if (ch && !found.includes(ch)) {
      found.push(ch)
      if (a.strong) strong = true
    }
  }
  // Hard filter: only auto-assign a channel that actually accepts this media.
  return { channels: found.filter((ch) => channelAccepts(ch, asset.mediaType)), strong }
}

/**
 * Infer the audience from the folder path by matching a path SEGMENT against the
 * brand's defined audience names (word overlap). A folder like
 * "Surf & Shore Casters/Instagram/clip.mp4" routes the asset to that audience so
 * it lands in the right lane on the canvas. Conservative: needs at least half an
 * audience's distinctive words present, and picks the strongest match.
 */
const audWords = (s: string): Set<string> =>
  new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))

function inferAudience(folderPath: string | undefined, audiences: string[]): string | undefined {
  if (!folderPath || audiences.length === 0) return undefined
  const segments = folderPath.split('/').map((s) => s.trim()).filter(Boolean)
  let best: { name: string; score: number } | undefined
  for (const seg of segments) {
    const segWords = audWords(seg)
    if (!segWords.size) continue
    for (const aud of audiences) {
      const target = audWords(aud)
      if (!target.size) continue
      let hit = 0
      for (const w of target) if (segWords.has(w)) hit += 1
      const score = hit / target.size
      if (hit > 0 && (!best || score > best.score)) best = { name: aud, score }
    }
  }
  return best && best.score >= 0.5 ? best.name : undefined
}

function classifyOne(asset: Asset, stemCounts: Map<string, number>, audiences: string[]): Asset {
  const tokenSet = new Set(tokenize(`${asset.folderPath ?? ''} ${asset.name}`))
  const sharesStem =
    asset.mediaType === 'image' && stem(asset.name).length >= 4 && (stemCounts.get(stemKey(asset)) ?? 0) >= 2
  const isCarousel =
    tokenSet.has('carousel') || tokenSet.has('slide') || tokenSet.has('slides') || sharesStem
  const family: Family = isCarousel ? 'carousel' : formatFamily(asset)

  const suggestedTypeFor: Partial<Record<ChannelId, string>> = {}
  for (const ch of ALL_CHANNELS) {
    if (channelAccepts(ch, asset.mediaType)) suggestedTypeFor[ch] = typeFor(ch, family, asset)
  }

  const { channels, strong } = resolveChannels(asset)
  const hasChannel = channels.length > 0
  return {
    ...asset,
    channels: hasChannel ? channels : asset.channels,
    suggestedTypeFor,
    // Keep an audience the caller already set; otherwise infer from the folder.
    audience: asset.audience || inferAudience(asset.folderPath, audiences),
    classifyConfidence: hasChannel ? (strong ? 0.9 : 0.72) : 0.3,
    classifySource: hasChannel ? 'path' : 'heuristic',
  }
}

/** Auto-organize a freshly ingested batch: infer channel + per-channel type and,
 *  when the brand's defined audience names are passed, the audience from the
 *  folder path. Batch-aware (carousel slides are detected across the group). */
export function classifyAssets(assets: Asset[], audiences: string[] = []): Asset[] {
  const stemCounts = new Map<string, number>()
  for (const a of assets) {
    if (a.mediaType !== 'image') continue
    if (stem(a.name).length < 4) continue // skip 'img', 'dsc' camera-roll stems
    stemCounts.set(stemKey(a), (stemCounts.get(stemKey(a)) ?? 0) + 1)
  }
  return assets.map((a) => classifyOne(a, stemCounts, audiences))
}
