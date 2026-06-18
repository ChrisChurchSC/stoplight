import type { Asset, MediaType } from '../domain/types'

let assetSeq = 0
function assetId(): string {
  assetSeq += 1
  return `asset_${Date.now().toString(36)}_${assetSeq}`
}

function detectMediaType(file: File): MediaType {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  // markdown, plain text, html, json all treated as text bodies; PDFs are
  // documents (handled below) — never read as text.
  return 'text'
}

const TEXT_EXT = /\.(md|markdown|txt|html?|json)$/i
const PDF_RE = /^application\/pdf$|\.pdf$/i

/** Read an image's natural pixel size off its object URL. Resolves null on
 *  error so a corrupt file can't hang the ingest await. */
function readImageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Read a video's dimensions + duration off its object URL (metadata only). */
function readVideoMeta(
  url: string,
): Promise<{ width: number; height: number; durationSec: number } | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () =>
      resolve({ width: v.videoWidth, height: v.videoHeight, durationSec: v.duration })
    v.onerror = () => resolve(null)
    v.src = url
  })
}

/** Convert dropped File objects into Asset records, reading text bodies inline
 *  and capturing image/video dimensions so the classifier can infer the type. */
export async function filesToAssets(files: File[]): Promise<Asset[]> {
  const assets = await Promise.all(
    files.map(async (file): Promise<Asset> => {
      const isPdf = PDF_RE.test(file.type) || PDF_RE.test(file.name)
      const mediaType = detectMediaType(file)
      const base: Asset = {
        id: assetId(),
        name: file.name,
        mediaType,
        mimeType: file.type || undefined,
        size: file.size,
        channels: [],
        caption: '',
        createdAt: Date.now(),
      }

      if (mediaType === 'image') {
        // Keep the object URL alive — Thumb + previews reuse it.
        base.previewUrl = URL.createObjectURL(file)
        const dims = await readImageSize(base.previewUrl)
        if (dims) {
          base.width = dims.width
          base.height = dims.height
        }
      } else if (mediaType === 'video') {
        base.previewUrl = URL.createObjectURL(file)
        const meta = await readVideoMeta(base.previewUrl)
        if (meta) {
          base.width = meta.width
          base.height = meta.height
          base.durationSec = meta.durationSec
        }
      } else if (isPdf) {
        // PDFs are documents, not text — never run file.text() (binary garbage).
        base.mimeType = 'application/pdf'
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
