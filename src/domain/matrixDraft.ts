import type { AudienceType } from './audiences'
import { primaryTypeKey } from './channelAssetTypes'
import type { MatrixCell } from './matrix'
import { isCtaField, messagingFields, primaryFieldKey } from './messaging'
import type { Rtb } from './rtb'
import type { ChannelId, MediaType, TrafficRow } from './types'

/**
 * Generate a draft asset for one matrix cell, straight from the brand model: the
 * audience's angle in the primary copy, the cell's stage-appropriate CTA, and the
 * lead proof attached to the claim so it's backed. Producing it from the model is
 * what keeps personalization coherent at volume — the asset should clear the
 * connection check by construction (proof attached, on-voice CTA, no em dashes).
 * The human still reviews and edits before it ships.
 *
 * Deterministic today (the recipe → components); a Claude pass can refine the copy
 * per channel later without changing this contract.
 */

const clip = (s: string, max?: number): string =>
  max && s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s

/**
 * Build the per-component messaging (and the proof attachment) for a channel from
 * the brand recipe: the audience's angle in the body, the proof woven into the
 * claim/headline/proof blocks, and the stage CTA in the CTA slots. Pulled out of
 * draftCellRow so a proof swap on the canvas can re-draft the copy in place,
 * keyed to the asset's actual channel + type.
 */
export function composeMessaging(opts: {
  channel: ChannelId
  assetType: string
  audience: { name: string; messageAngle?: string }
  proof: Rtb | undefined
  cta: string
}): { messaging: Record<string, string>; rtbMap?: Record<string, string[]> } {
  const { channel, assetType, audience, proof: lead, cta } = opts
  const angle = audience.messageAngle?.trim() || `What ${audience.name} cares about`
  const headline = lead ? lead.label : angle.split(/[.;]/)[0].trim()
  const body = lead ? `${angle}. ${lead.detail}` : `${angle}.`
  const proofLine = lead ? `${lead.label}. ${lead.detail}` : angle

  const fields = messagingFields(channel, assetType)
  const primaryKey = primaryFieldKey(channel, assetType)
  // Fill every component the channel's schema defines — including channel-specific
  // ones (multiple CTAs, proof blocks, a video hook/script) — so the card reflects
  // what the channel actually is, not a one-size-fits-all shape.
  const messaging: Record<string, string> = {}
  for (const f of fields) {
    const k = f.key
    let v: string
    if (isCtaField(k) || /end-screen|companion|pinned/.test(k)) v = cta
    else if (/proof/.test(k)) v = proofLine
    else if (/hook/.test(k)) v = angle.split(/[.;]/)[0].trim() || headline
    else if (/headline|^title$|subject|^brand$|business|long-headline/.test(k)) v = headline
    else if (/description|preview|subhead|meta-description|key-takeaway|faq/.test(k))
      v = lead ? lead.label : angle
    else if (k === primaryKey || /primary|caption|body|post|intro|message|script/.test(k)) v = body
    else v = headline
    messaging[k] = clip(v, f.hardLimit)
  }
  // Attach the lead proof to the claim-carrying components (primary + every proof
  // block) so the asset is backed and clears the proof-gap check.
  let rtbMap: Record<string, string[]> | undefined
  if (lead) {
    rtbMap = { [primaryKey]: [lead.id] }
    for (const f of fields) if (/proof/.test(f.key)) rtbMap[f.key] = [lead.id]
  }
  return { messaging, rtbMap }
}

export function draftCellRow(opts: {
  audience: AudienceType
  cell: MatrixCell
  channel: ChannelId
  campaign: string
  index: number
  now: number
  /** The asset format (e.g. Reel, Newsletter). Falls back to the channel's primary. */
  assetType?: string
}): TrafficRow {
  const { audience, cell, channel, campaign, index, now } = opts
  const assetType = opts.assetType ?? primaryTypeKey(channel)
  const { messaging, rtbMap } = composeMessaging({
    channel,
    assetType,
    audience,
    proof: cell.proof[0]?.rtb,
    cta: cell.cta,
  })

  const mediaType: MediaType = 'text'
  const slug = `${audience.name}-${cell.stage}-${channel}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const stamp = now.toString(36)
  return {
    id: `draft_${stamp}_${index}`,
    assetId: `draft_asset_${stamp}_${index}`,
    assetName: `${slug}-v${index + 1}`,
    mediaType,
    channel,
    assetType,
    messaging,
    rtbMap,
    campaign,
    audience: audience.name,
    scheduledAt: new Date(now + 3 * 24 * 3_600_000).toISOString(),
    status: 'draft',
    createdAt: now,
  }
}
