import type { Asset, MediaType } from '../domain/types'

let assetSeq = 0
function assetId(): string {
  assetSeq += 1
  return `asset_${Date.now().toString(36)}_${assetSeq}`
}

function detectMediaType(file: File): MediaType {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  // markdown, plain text, html, json all treated as text bodies
  return 'text'
}

const TEXT_EXT = /\.(md|markdown|txt|html?|json)$/i

/** Convert dropped File objects into Asset records, reading text bodies inline. */
export async function filesToAssets(files: File[]): Promise<Asset[]> {
  const assets = await Promise.all(
    files.map(async (file): Promise<Asset> => {
      const mediaType = detectMediaType(file)
      const base: Asset = {
        id: assetId(),
        name: file.name,
        mediaType,
        size: file.size,
        channels: [],
        caption: '',
        createdAt: Date.now(),
      }

      if (mediaType === 'image' || mediaType === 'video') {
        base.previewUrl = URL.createObjectURL(file)
      } else if (mediaType === 'text' || TEXT_EXT.test(file.name)) {
        base.mediaType = 'text'
        base.body = await file.text()
      }
      return base
    }),
  )
  return assets
}

/** Build a link asset from a pasted/dropped URL. */
export function urlToAsset(url: string): Asset {
  const trimmed = url.trim()
  let name = trimmed
  try {
    name = new URL(trimmed).hostname + new URL(trimmed).pathname
  } catch {
    /* keep raw string as name */
  }
  return {
    id: assetId(),
    name,
    mediaType: 'link',
    previewUrl: trimmed,
    channels: [],
    caption: '',
    createdAt: Date.now(),
  }
}

const URL_RE = /^https?:\/\/\S+$/i
export function looksLikeUrl(text: string): boolean {
  return URL_RE.test(text.trim())
}
