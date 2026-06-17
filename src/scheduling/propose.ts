import { CHANNELS } from '../domain/channels'
import { primarySlotKey, slotsFor } from '../domain/channelAssets'
import type { Asset, ChannelId, TrafficRow } from '../domain/types'

let rowSeq = 0
function rowId(): string {
  rowSeq += 1
  return `row_${Date.now().toString(36)}_${rowSeq}`
}

/**
 * Walk a channel's best-time slots forward from `now`, producing the Nth
 * upcoming slot. Slots that have already passed today roll to the next day.
 * The batch is spread one-post-per-slot so multiple assets on the same channel
 * don't all stack on the same minute.
 */
function nthSlot(channel: ChannelId, index: number, now: Date): Date {
  const slots = CHANNELS[channel].bestTimes
  const perDay = slots.length
  const dayOffset = Math.floor(index / perDay)
  const slot = slots[index % perDay]

  const candidate = new Date(now)
  candidate.setDate(candidate.getDate() + dayOffset)
  candidate.setHours(slot.hour, slot.minute, 0, 0)

  // If the very first slot for today is already in the past, push a day.
  if (dayOffset === 0 && candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1)
  }
  return candidate
}

/**
 * Propose a schedule for a batch of assets. Each (asset, channel) pair becomes
 * one draft TrafficRow with a best-time slot. Returns rows in draft status —
 * nothing is approved or posted here.
 */
export function proposeSchedule(assets: Asset[], now: Date = new Date()): TrafficRow[] {
  // Track how many rows we've already placed per channel to advance slots.
  const placedPerChannel: Partial<Record<ChannelId, number>> = {}
  const rows: TrafficRow[] = []

  for (const asset of assets) {
    for (const channel of asset.channels) {
      const index = placedPerChannel[channel] ?? 0
      placedPerChannel[channel] = index + 1
      const when = nthSlot(channel, index, now)

      // One row per required slot when allFormats, else just the primary slot.
      // All slots of a (asset, channel) share the same scheduled time.
      const slotKeys = asset.allFormats
        ? slotsFor(channel).map((s) => s.key)
        : [primarySlotKey(channel)]

      for (const format of slotKeys) {
        rows.push({
          id: rowId(),
          assetId: asset.id,
          assetName: asset.name,
          mediaType: asset.mediaType,
          channel,
          format,
          caption: asset.caption,
          body: asset.body,
          campaign: '',
          audience: '',
          scheduledAt: when.toISOString(),
          status: 'draft',
          mediaRef: asset.previewUrl,
          createdAt: Date.now(),
        })
      }
    }
  }

  // Stable sort by time so the review table reads chronologically.
  rows.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  return rows
}
