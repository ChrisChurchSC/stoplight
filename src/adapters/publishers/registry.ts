import { CHANNELS } from '../../domain/channels'
import type { ChannelId } from '../../domain/types'
import { HubSpotPublisher } from './hubspotPublisher'
import { mockPublishers } from './mockPublishers'
import type { PublisherRegistry } from './types'

/**
 * Composes the per-channel publisher registry — the single place that decides
 * which backend each channel publishes through.
 *
 *  - Owned / lifecycle channels go through the CRM (HubSpot is the send/host
 *    engine for email, landing pages, forms, SMS).
 *  - Everything else falls back to the mock publisher in v1; swap in Buffer /
 *    Sprout for organic social and the ad-platform clients for paid later.
 */
const HUBSPOT_CHANNELS: ChannelId[] = ['email', 'landing-page', 'lead-magnet', 'sms']

export const publishers: PublisherRegistry = (Object.keys(CHANNELS) as ChannelId[]).reduce(
  (reg, id) => {
    reg[id] = HUBSPOT_CHANNELS.includes(id)
      ? new HubSpotPublisher(id)
      : mockPublishers[id]!
    return reg
  },
  {} as PublisherRegistry,
)
