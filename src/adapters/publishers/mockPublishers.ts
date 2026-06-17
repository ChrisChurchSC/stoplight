import { CHANNELS, channelAccepts } from '../../domain/channels'
import type { ChannelId, TrafficRow } from '../../domain/types'
import type { Publisher, PublisherRegistry, PublishResult } from './types'

/**
 * A no-network publisher used for every channel in v1. validate() applies the
 * same media-fit rules a real client would; publish() simulates a successful
 * stage and returns a fake external id/url.
 */
class MockPublisher implements Publisher {
  constructor(public channel: ChannelId) {}

  validate(row: TrafficRow): { ok: boolean; warnings: string[] } {
    const warnings: string[] = []
    if (!channelAccepts(this.channel, row.mediaType)) {
      warnings.push(
        `${row.mediaType} is an unusual fit for ${CHANNELS[this.channel].label}`,
      )
    }
    if (!row.caption.trim()) {
      warnings.push('No caption/copy set')
    }
    return { ok: warnings.length === 0, warnings }
  }

  async publish(row: TrafficRow): Promise<PublishResult> {
    // Simulate the platform accepting the item into its queue.
    return {
      ok: true,
      externalId: `mock_${this.channel}_${row.id}`,
      url: `https://example.test/${this.channel}/${row.id}`,
    }
  }
}

/** Every channel maps to a mock publisher in v1. */
export const mockPublishers: PublisherRegistry = Object.fromEntries(
  Object.keys(CHANNELS).map((id) => [id, new MockPublisher(id as ChannelId)]),
) as PublisherRegistry
