import { messagingAllText, messagingMap } from '../../domain/messaging'
import type { ChannelId, TrafficRow } from '../../domain/types'
import type { Publisher, PublishResult } from './types'

/**
 * Real email publisher: POSTs the email row to the server-side /api/publish-email
 * endpoint (which creates a Resend broadcast). Falls back to the supplied
 * publisher (the mock) when the backend is absent, has no Resend key (501), or
 * errors — so Publish always works, configured or not. Same seam as BufferPublisher.
 */

/** Compose the email's HTML body from its messaging components. */
function emailHtml(row: TrafficRow): string {
  const m = messagingMap(row)
  const parts: string[] = []
  if (m.headline?.trim()) parts.push(`<h1>${m.headline}</h1>`)
  if (m.body?.trim()) parts.push(`<p>${m.body.replace(/\n/g, '<br>')}</p>`)
  if (m.cta?.trim()) parts.push(`<p><a href="#">${m.cta}</a></p>`)
  return parts.join('\n') || `<p>${messagingAllText(row)}</p>`
}

export class ResendPublisher implements Publisher {
  constructor(
    public channel: ChannelId,
    private fallback: Publisher,
  ) {}

  validate(row: TrafficRow): { ok: boolean; warnings: string[] } {
    const m = messagingMap(row)
    const warnings: string[] = []
    if (!m.subject?.trim()) warnings.push('No subject line for the email')
    if (!m.body?.trim() && !messagingAllText(row).trim()) warnings.push('No email body set')
    return { ok: warnings.length === 0, warnings }
  }

  async publish(row: TrafficRow): Promise<PublishResult> {
    try {
      const res = await fetch('/api/publish-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject: messagingMap(row).subject ?? row.assetName,
          html: emailHtml(row),
          assetName: row.assetName,
          scheduledAt: row.scheduledAt,
        }),
      })
      if (!res.ok) throw new Error(`publish-email ${res.status}`)
      return (await res.json()) as PublishResult
    } catch {
      // No backend / no Resend key / error → mock keeps Publish working.
      return this.fallback.publish(row)
    }
  }
}
