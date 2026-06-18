import { CHANNELS } from '../../domain/channels'
import type { ChannelId } from '../../domain/types'
import { BufferPublisher } from './bufferPublisher'
import { HubSpotPublisher } from './hubspotPublisher'
import { mockPublishers } from './mockPublishers'
import type { PublisherRegistry } from './types'

/**
 * Composes the per-channel publisher registry — the single place that decides
 * which backend each channel publishes through.
 *
 *  - Owned / lifecycle channels go through the CRM (HubSpot is the send/host
 *    engine for email, landing pages, forms, SMS).
 *  - Organic social goes through Buffer (real `/api/publish` when configured,
 *    mock fallback otherwise — same key-gated seam as the ICP review).
 *  - Paid (ad-platform) channels still mock; swap in the ad clients later.
 */
const HUBSPOT_CHANNELS: ChannelId[] = ['email', 'landing-page', 'lead-magnet', 'sms']
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
    reg[id] = HUBSPOT_CHANNELS.includes(id)
      ? new HubSpotPublisher(id)
      : BUFFER_CHANNELS.includes(id)
        ? new BufferPublisher(id, mockPublishers[id]!)
        : mockPublishers[id]!
    return reg
  },
  {} as PublisherRegistry,
)
