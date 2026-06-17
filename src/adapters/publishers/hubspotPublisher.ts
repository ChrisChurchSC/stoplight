import { CHANNELS } from '../../domain/channels'
import type { ChannelId, TrafficRow } from '../../domain/types'
import type { Publisher, PublishResult } from './types'

/**
 * The request this publisher would send to HubSpot for a row. Surfaced as a
 * type so the real transport (a server-side HubSpot API call, or the connected
 * HubSpot integration) is one clear, swappable seam.
 */
export interface HubSpotRequest {
  object: 'marketing-email' | 'landing-page' | 'form' | 'sms'
  endpoint: string
  payload: Record<string, unknown>
}

export type HubSpotTransport = (req: HubSpotRequest) => Promise<PublishResult>

/** Which HubSpot object each owned/lifecycle channel maps to. */
const OBJECT_BY_CHANNEL: Partial<Record<ChannelId, HubSpotRequest['object']>> = {
  email: 'marketing-email',
  'landing-page': 'landing-page',
  'lead-magnet': 'form',
  sms: 'sms',
}

const ENDPOINT: Record<HubSpotRequest['object'], string> = {
  'marketing-email': '/marketing/v3/emails',
  'landing-page': '/cms/v3/pages/landing-pages',
  form: '/marketing/v3/forms',
  sms: '/marketing/v3/sms', // requires the HubSpot SMS add-on
}

/**
 * Publishes owned/lifecycle assets through HubSpot, which is the actual send /
 * host engine for these channels (email, landing pages, forms, SMS).
 *
 * In v1 it runs without a transport and simulates a staged asset. To go live,
 * construct it with a `transport` that performs the HubSpot API call — the row
 * → request mapping and campaign attribution below are already in place.
 */
export class HubSpotPublisher implements Publisher {
  constructor(
    public channel: ChannelId,
    private transport?: HubSpotTransport,
  ) {}

  validate(row: TrafficRow): { ok: boolean; warnings: string[] } {
    const warnings: string[] = []
    if (!row.caption.trim()) warnings.push('No copy/body set for the HubSpot asset')
    if (!(row.campaign ?? '').trim()) {
      warnings.push("No campaign — won't roll up to CRM attribution")
    }
    return { ok: warnings.length === 0, warnings }
  }

  /** Map a trafficking row to the HubSpot object + payload it should become. */
  toRequest(row: TrafficRow): HubSpotRequest {
    const object = OBJECT_BY_CHANNEL[this.channel] ?? 'marketing-email'
    return {
      object,
      endpoint: ENDPOINT[object],
      payload: {
        name: `${row.assetName} — ${CHANNELS[this.channel].label}`,
        body: row.caption,
        publishDate: row.scheduledAt,
        // Associate to a campaign so content → contact → pipeline closes the loop.
        campaignName: row.campaign || undefined,
        audience: row.audience || undefined,
      },
    }
  }

  async publish(row: TrafficRow): Promise<PublishResult> {
    const req = this.toRequest(row)
    if (this.transport) return this.transport(req)

    // v1: no transport wired — simulate a successfully staged HubSpot asset.
    return {
      ok: true,
      externalId: `hs_${this.channel}_${row.id}`,
      url: `https://app.hubspot.com${req.endpoint}/${row.id}`,
    }
  }
}
