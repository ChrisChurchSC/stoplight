/**
 * Route an ingested image through a resizing image CDN so a card loads a lightweight
 * webp thumbnail (tens of KB) instead of the full ~366KB original — the main load-time
 * win for a canvas of dozens of real posts. Public http(s) images only; local object
 * URLs (blob:/data:) pass through untouched. Degrades gracefully: if the CDN can't
 * serve, the <img>/Thumb onError falls back to the placeholder, so nothing breaks.
 */
export function proxiedMedia(url: string | undefined, width = 720): string | undefined {
  if (!url || !/^https?:\/\//i.test(url)) return url
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${width}&output=webp&q=72`
}
