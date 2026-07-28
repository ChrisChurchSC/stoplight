import { hasBudget, isPaidRow, money } from './budget'
import { CHANNELS } from './channels'
import { isValidType, typeLabel } from './channelAssetTypes'
import { isCtaField, messagingFields, messagingMap } from './messaging'
import { isTrackingClean } from './tracking'
import type { TrafficRow } from './types'

/**
 * The specs an asset needs to actually post on its channel: the right format, a
 * creative, copy within the limits, a call to action, tracking, and a budget when it's
 * paid. Only the checks that apply to this channel/type are returned, so an organic
 * post shows a short list and a paid ad a longer one. Reviewing an asset is clearing
 * this checklist, so the review drawer leads with it.
 */

export interface PostCheck {
  key: string
  label: string
  ok: boolean
  /** One line: what's still needed (failing) or the satisfied value (passing). */
  detail: string
  /** Collapsed drawer section to open when the operator clicks a failing check. */
  fix?: 'details' | 'tracking' | 'budget'
}

export function postSpec(row: TrafficRow): PostCheck[] {
  const fields = messagingFields(row.channel, row.assetType)
  const map = messagingMap(row)
  const visual = row.mediaType === 'image' || row.mediaType === 'video'
  const paid = isPaidRow(row)
  const ctaField = fields.find((fl) => isCtaField(fl.key))
  const checks: PostCheck[] = []

  // Format — a valid asset type for the channel.
  const typeOk = isValidType(row.channel, row.assetType)
  checks.push({
    key: 'format',
    label: 'Format',
    ok: typeOk,
    detail: typeOk ? typeLabel(row.channel, row.assetType) || 'set' : `Pick a format for ${CHANNELS[row.channel].label}`,
    fix: 'details',
  })

  // Creative — visual channels need the media attached.
  if (visual) {
    checks.push({
      key: 'creative',
      label: 'Creative',
      ok: !!row.mediaRef,
      detail: row.mediaRef ? 'attached' : 'Upload the image or video',
    })
  }

  // Copy — the main content field filled, nothing over a hard limit.
  const mainField = fields.find((fl) => !isCtaField(fl.key)) ?? fields[0]
  const over = fields.find((fl) => fl.hardLimit && (map[fl.key]?.length ?? 0) > fl.hardLimit)
  if (mainField) {
    const mainVal = (map[mainField.key] ?? '').trim()
    checks.push({
      key: 'copy',
      label: 'Copy',
      ok: !!mainVal && !over,
      detail: !mainVal
        ? `Add the ${mainField.label.toLowerCase()}`
        : over
          ? `${over.label} is over the ${over.hardLimit} limit`
          : 'within limits',
    })
  }

  // Call to action — for channels that carry one.
  if (ctaField) {
    const ctaVal = (map[ctaField.key] ?? '').trim()
    checks.push({ key: 'cta', label: 'Call to action', ok: !!ctaVal, detail: ctaVal || 'Add a CTA' })
  }

  // Tracking — paid, or anything that drives a click.
  if (paid || ctaField) {
    const trackOk = !!row.utm && isTrackingClean(row)
    checks.push({
      key: 'tracking',
      label: 'Tracking',
      ok: trackOk,
      detail: trackOk ? 'UTMs clean' : 'Add tracking (UTMs)',
      fix: 'tracking',
    })
  }

  // Budget — paid assets need one.
  if (paid) {
    const budgetOk = hasBudget(row)
    checks.push({
      key: 'budget',
      label: 'Budget',
      ok: budgetOk,
      detail: budgetOk ? `${money(row.budget!.amount)}${row.budget!.type === 'daily' ? '/day' : ''}` : 'Set a budget',
      fix: 'budget',
    })
  }

  return checks
}

export const postReady = (checks: PostCheck[]): boolean => checks.every((c) => c.ok)
