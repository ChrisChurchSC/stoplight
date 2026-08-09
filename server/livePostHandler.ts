import { readLivePost, type LivePostRead } from './livePost.js'

/**
 * Read back what a published post says, given its URL. The route in front of livePost.ts.
 *
 * NO MODEL KEY REQUIRED, which is unusual for this directory and is the point: a YouTube video reads
 * through a public API key and a web page reads through an ordinary fetch, so an asset can be
 * reconciled to what it actually said on a deployment with no AI configured at all. Whether the
 * source is readable is answered in the RESULT (`available` plus a reason) rather than by throwing —
 * "Instagram needs connecting" is a fact about the platform, not a failure of the request, and a 501
 * would make the client's generic no-model fallback swallow the one sentence worth showing.
 */
export async function runReadLivePost(body: unknown): Promise<LivePostRead> {
  const { url } = (body ?? {}) as { url?: unknown }
  if (typeof url !== 'string' || !url.trim()) return { available: false, reason: 'unreadable-url' }
  return await readLivePost(url)
}
