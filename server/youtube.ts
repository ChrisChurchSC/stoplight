/**
 * Read a brand's recent YouTube content via the public YouTube Data API v3.
 * Given a channel URL discovered from their site, returns recent video titles +
 * descriptions to feed the current-state map. Gated on YOUTUBE_API_KEY: returns
 * null when unset, so onboarding stays website + ads until a key is added. The
 * key is a plain Google API key (YouTube Data API enabled), public data only.
 */

const API = 'https://www.googleapis.com/youtube/v3'

interface YtVideo {
  snippet?: { title?: string; description?: string }
}
interface YtChannel {
  snippet?: { title?: string }
  contentDetails?: { relatedPlaylists?: { uploads?: string } }
}

/** Resolve a channel URL to its channels.list query (id= or forHandle=). */
function channelQuery(channelUrl: string): string | null {
  let path: string
  try {
    path = new URL(channelUrl).pathname
  } catch {
    return null
  }
  const id = /\/channel\/(UC[\w-]+)/.exec(path)?.[1]
  if (id) return `id=${id}`
  const handle = /\/@([\w.-]+)/.exec(path)?.[1]
  if (handle) return `forHandle=${encodeURIComponent(handle)}`
  // Legacy /c/Name or /user/Name: best handled via forHandle on the name.
  const legacy = /\/(?:c|user)\/([\w.-]+)/.exec(path)?.[1]
  if (legacy) return `forHandle=${encodeURIComponent(legacy)}`
  return null
}

export async function readYouTube(channelUrl: string): Promise<{ text: string; title: string; count: number } | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key || !channelUrl) return null
  const q = channelQuery(channelUrl)
  if (!q) return null
  try {
    const chRes = await fetch(`${API}/channels?part=contentDetails,snippet&${q}&key=${key}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!chRes.ok) return null
    const ch = ((await chRes.json()) as { items?: YtChannel[] }).items?.[0]
    const uploads = ch?.contentDetails?.relatedPlaylists?.uploads
    const title = ch?.snippet?.title ?? 'channel'
    if (!uploads) return { text: '', title, count: 0 }

    const plRes = await fetch(`${API}/playlistItems?part=snippet&playlistId=${uploads}&maxResults=15&key=${key}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!plRes.ok) return { text: '', title, count: 0 }
    const items = ((await plRes.json()) as { items?: YtVideo[] }).items ?? []
    const lines = items
      .map((it) => {
        const t = (it.snippet?.title ?? '').trim()
        const d = (it.snippet?.description ?? '').trim().replace(/\s+/g, ' ').slice(0, 280)
        return t ? `- ${t}${d ? `: ${d}` : ''}` : ''
      })
      .filter(Boolean)
    return { text: lines.join('\n').slice(0, 6000), title, count: lines.length }
  } catch {
    return null
  }
}
