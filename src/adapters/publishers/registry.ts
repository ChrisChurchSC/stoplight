import { CHANNELS } from '../../domain/channels'
import type { ChannelId } from '../../domain/types'
import { BufferPublisher } from './bufferPublisher'
import { HubSpotPublisher } from './hubspotPublisher'
import { ResendPublisher } from './resendPublisher'
import { mockPublishers } from './mockPublishers'
import type { PublisherRegistry } from './types'

/**
 * Composes the per-channel publisher registry — the single place that decides
 * which backend each channel publishes through.
 *
 *  - Email goes through Resend (real `/api/publish-email` → a Resend broadcast
 *    when configured, mock fallback otherwise).
 *  - The other owned/lifecycle channels (landing pages, forms, SMS) go through
 *    the CRM (HubSpot is their send/host engine).
 *  - Organic social goes through Buffer (real `/api/publish` when configured,
 *    mock fallback otherwise — same key-gated seam as the ICP review).
 *  - Paid (ad-platform) channels still mock; swap in the ad clients later.
 */
const HUBSPOT_CHANNELS: ChannelId[] = ['landing-page', 'lead-magnet', 'sms']
const BUFFER_CHANNELS: ChannelId[] = [
  'instagram',
  'facebook',
  'linkedin',
  'x',
  'tiktok',
  'youtube',
  'pinterest',
]

export const publishers: PublisherRegistry = (Object.keys(CHANNELS) as ChannelId[]).reduce(
  (reg, id) => {
    reg[id] =
      id === 'email'
        ? new ResendPublisher(id, mockPublishers[id]!)
        : HUBSPOT_CHANNELS.includes(id)
          ? new HubSpotPublisher(id)
          : BUFFER_CHANNELS.includes(id)
            ? new BufferPublisher(id, mockPublishers[id]!)
            : mockPublishers[id]!
    return reg
  },
  {} as PublisherRegistry,
)
