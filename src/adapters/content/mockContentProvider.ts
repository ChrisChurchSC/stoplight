import type { ContentBatch, ContentProvider } from './types'

/**
 * Last-known content backfill per brand, pulled from the connected channels
 * (Summer / Forward + the platform APIs). Stands in until a proxy is deployed
 * (see httpContentProvider), so "Ingest everything to date" works end to end and
 * survives a localStorage reset. These are the real World Within posts: the top
 * YouTube videos (exact video ids → watch URLs) and the LinkedIn company posts
 * (real commentary + impressions). Each item is loosely shaped on purpose —
 * normalizeImportItem maps caption/title/url/date/metrics to row fields.
 *
 * YouTube carries exact watch URLs (video_id is stable), so those dedup by URL and
 * re-ingesting refreshes their metrics in place. LinkedIn's post ids exceed JS's
 * safe-integer range (they'd round to a wrong activity), so those items ship without
 * a URL and dedup by their (distinct) copy instead — no broken links.
 */

/**
 * Deliberately empty.
 *
 * This held one real client's actual published content: exact YouTube video ids with live watch
 * URLs, verbatim LinkedIn post copy with its impression counts, and real sent email campaigns.
 * Because this is the DEFAULT provider whenever VITE_CONTENT_URL is unset (see ./index.ts), all of
 * it was compiled into the shipped bundle and served to anyone who loaded the app, and "Ingest
 * everything to date" wrote another brand's posts into whoever pressed it.
 *
 * Do not repopulate it with real content. Whatever goes in this object ships to every visitor.
 *
 * With no entry, fetch returns null for every brand and the ingest path reports that there is
 * nothing to pull, which is the truth when no channel is connected.
 */
const BATCHES: Record<string, ContentBatch[]> = {}

export const mockContentProvider: ContentProvider = {
  source: 'Summer · Forward API',
  async fetch(brand) {
    // Simulate the round trip so the UI's loading state is honest.
    await new Promise((r) => setTimeout(r, 600))
    return BATCHES[brand.trim()] ?? null
  },
}
