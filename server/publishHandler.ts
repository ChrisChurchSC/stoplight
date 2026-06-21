/**
 * Server-side publish via Buffer. Runs ONLY on the dev server / a serverless
 * function — never in the browser — so the Buffer token stays private. Throws
 * NO_KEY when BUFFER_ACCESS_TOKEN or the profile map is unset, so the client
 * falls back to the mock publisher. Mirrors server/icpReviewHandler.ts.
 */

export interface PublishInput {
  channel: string
  text: string
  scheduledAt?: string
  assetName?: string
  mediaType?: string
  mediaUrl?: string
}

export interface PublishOutput {
  ok: boolean
  externalId?: string
  url?: string
  error?: string
}

class NoKeyError extends Error {
  code = 'NO_KEY' as const
}

/**
 * Push one row to Buffer. Requires:
 *  - BUFFER_ACCESS_TOKEN
 *  - BUFFER_PROFILE_IDS — JSON map of channel id → Buffer profile id,
 *    e.g. {"instagram":"5f...","linkedin":"6a..."}
 */
export async function runPublish(input: PublishInput): Promise<PublishOutput> {
  const token = process.env.BUFFER_ACCESS_TOKEN
  const profilesRaw = process.env.BUFFER_PROFILE_IDS
  if (!token || !profilesRaw) throw new NoKeyError('Buffer not configured')

  let profiles: Record<string, string>
  try {
    profiles = JSON.parse(profilesRaw) as Record<string, string>
  } catch {
    // Malformed BUFFER_PROFILE_IDS is "not configured", not a server crash —
    // fall back to the mock honestly (501) instead of a silent 500.
    throw new NoKeyError('BUFFER_PROFILE_IDS is not valid JSON')
  }
  const profileId = profiles[input.channel]
  if (!profileId) throw new NoKeyError(`No Buffer profile for ${input.channel}`)

  const body = new URLSearchParams()
  body.set('profile_ids[]', profileId)
  body.set('text', input.text)
  body.set('access_token', token)
  if (input.scheduledAt) {
    body.set('scheduled_at', String(Math.floor(new Date(input.scheduledAt).getTime() / 1000)))
  }
  if (input.mediaUrl && (input.mediaType === 'image' || input.mediaType === 'video')) {
    body.set('media[photo]', input.mediaUrl)
  }

  const res = await fetch('https://api.bufferapp.com/1/updates/create.json', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean
    message?: string
    updates?: { id?: string; service_link?: string }[]
  }
  if (!res.ok || json.success === false) {
    return { ok: false, error: json.message ?? `Buffer ${res.status}` }
  }
  const update = json.updates?.[0]
  return { ok: true, externalId: update?.id, url: update?.service_link }
}
