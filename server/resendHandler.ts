/**
 * Server-side email publish via Resend. Runs ONLY on the dev server / a
 * serverless function — never in the browser — so the Resend key stays private.
 * Throws NO_KEY when Resend isn't configured, so the client falls back to the
 * mock publisher. Mirrors server/publishHandler.ts.
 *
 * An email asset becomes a Resend *broadcast* draft (a campaign email to an
 * audience), the same "stage it for review/send" stop the HubSpot publisher made.
 */

export interface EmailPublishInput {
  subject: string
  html: string
  assetName?: string
  scheduledAt?: string
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
 * Stage one email row as a Resend broadcast. Requires:
 *  - RESEND_API_KEY
 *  - RESEND_AUDIENCE_ID — the audience the broadcast targets
 *  - RESEND_FROM_EMAIL — the verified sender
 */
export async function runPublishEmail(input: EmailPublishInput): Promise<PublishOutput> {
  const apiKey = process.env.RESEND_API_KEY
  const audienceId = process.env.RESEND_AUDIENCE_ID
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !audienceId || !from) throw new NoKeyError('Resend not configured')

  const name = input.assetName || input.subject || 'Campaign email'
  const res = await fetch('https://api.resend.com/broadcasts', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      audience_id: audienceId,
      from,
      name,
      subject: input.subject || name,
      html: input.html || '<p></p>',
    }),
  })
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
  if (!res.ok || !json.id) {
    return { ok: false, error: json.message ?? `Resend ${res.status}` }
  }
  return { ok: true, externalId: json.id, url: `https://resend.com/broadcasts/${json.id}` }
}
