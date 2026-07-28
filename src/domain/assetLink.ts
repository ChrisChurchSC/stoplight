import { CHANNELS } from './channels'
import type { TrafficRow } from './types'

/**
 * A hyperlink to the asset itself. Prefers the real source URL once it exists —
 * the object URL for an upload, the href for a dropped link, or the permalink an
 * ingest writes back to `mediaRef`. For seeded / not-yet-published rows it falls
 * back to a deterministic platform permalink so every asset is still reachable
 * from its card. (Swap the fallback for the real permalink as ingest populates it.)
 */

// Platform → public domain for a permalink-style fallback.
const PLATFORM_DOMAIN: Record<string, string> = {
  Instagram: 'instagram.com',
  Facebook: 'facebook.com',
  Meta: 'facebook.com',
  TikTok: 'tiktok.com',
  LinkedIn: 'linkedin.com',
  X: 'x.com',
  YouTube: 'youtube.com',
  Pinterest: 'pinterest.com',
  Reddit: 'reddit.com',
  Snapchat: 'snapchat.com',
  Google: 'google.com',
}

/** A short, stable slug for the fallback permalink path. */
const slug = (row: TrafficRow): string =>
  (row.id || row.assetName || 'asset').replace(/[^a-z0-9]+/gi, '').slice(-12) || 'asset'

export function assetHref(row: TrafficRow): string {
  // A real source URL written by upload / link-drop / ingest wins.
  if (row.mediaRef && /^(https?:|blob:)/.test(row.mediaRef)) return row.mediaRef
  const domain = PLATFORM_DOMAIN[CHANNELS[row.channel]?.platform ?? '']
  if (domain) return `https://www.${domain}/${slug(row)}`
  // Owned / other channels with no public permalink — a durable app reference.
  return `https://assets.hyperfocus.app/${row.id}`
}
