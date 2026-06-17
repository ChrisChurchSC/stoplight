import { assetRtbIds } from '../../domain/rtb'
import { messagingMap } from '../../domain/messaging'
import type { TrafficRow } from '../../domain/types'
import type { BatchReview, Icp, IcpReviewer } from './types'

/**
 * Real ICP reviewer: POSTs the ICP + the to-be-scheduled batch to the
 * server-side /api/icp-review endpoint (which calls Claude). Falls back to the
 * supplied heuristic reviewer when the backend is absent, has no API key
 * (501), or errors — so the gate always works, key or not.
 */
export class ClaudeIcpReviewer implements IcpReviewer {
  constructor(private fallback: IcpReviewer) {}

  async review(icp: Icp, rows: TrafficRow[]): Promise<BatchReview> {
    const assets = rows
      .filter((r) => r.status !== 'posted' && r.status !== 'failed')
      .map((r) => ({
        rowId: r.id,
        assetName: r.assetName,
        channel: r.channel,
        type: r.assetType,
        campaign: r.campaign,
        messaging: messagingMap(r),
        rtbs: assetRtbIds(r),
      }))

    try {
      const res = await fetch('/api/icp-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ icp, assets }),
      })
      if (!res.ok) throw new Error(`icp-review ${res.status}`)
      return (await res.json()) as BatchReview
    } catch {
      // No backend / no key / error → heuristic review keeps the gate working.
      return this.fallback.review(icp, rows)
    }
  }
}
