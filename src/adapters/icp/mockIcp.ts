import type { TrafficRow } from '../../domain/types'
import type { AssetFlag, BatchReview, Icp, IcpReviewer, IcpSource } from './types'

/**
 * Stand-in for the Clay pull. Returns a sample ICP that fits the seeded
 * campaign. Swap for a real adapter that reads a Clay table / scored segment
 * (structured) and/or a written profile (narrative) via the Clay MCP.
 */
export class MockIcpSource implements IcpSource {
  async fetch(): Promise<Icp> {
    return {
      name: 'Mid-market Ops leaders',
      segment: 'Tier 1 — Enterprise-ready',
      summary:
        'VPs and Directors of Operations at mid-market B2B SaaS companies (200–2,000 employees) drowning in manual, fragmented workflows. They value speed, reliability, and cutting busywork for their teams. Skeptical of hype; they want proof and fast time-to-value.',
      firmographics: [
        { label: 'Industry', value: 'B2B SaaS' },
        { label: 'Company size', value: '200–2,000 employees' },
        { label: 'Region', value: 'North America' },
        { label: 'Buyer', value: 'VP / Director of Operations' },
      ],
      pains: ['manual workflows', 'slow tools', 'busywork', 'fragmented stack', 'time-to-value', 'speed', 'faster'],
    }
  }
}

const reviewable = (r: TrafficRow) => r.status !== 'posted' && r.status !== 'failed'

function rowText(r: TrafficRow): string {
  return [r.caption, r.body, r.extractedCopy].filter(Boolean).join(' ').toLowerCase()
}

/**
 * Heuristic stand-in for the Claude batch review. Evaluates the to-be-scheduled
 * set TOGETHER: flags assets with no copy or that don't reference the ICP's
 * pains, and judges whether the batch tells one story. Swap for a real adapter
 * that sends the ICP + all assets to Claude in one call (server-side).
 */
export class MockIcpReviewer implements IcpReviewer {
  async review(icp: Icp, rows: TrafficRow[]): Promise<BatchReview> {
    const batch = rows.filter(reviewable)
    const pains = icp.pains.map((p) => p.toLowerCase())
    const flags: AssetFlag[] = []

    for (const r of batch) {
      const text = rowText(r)
      if (!text.trim()) {
        flags.push({
          rowId: r.id,
          assetName: r.assetName,
          channel: r.channel,
          verdict: 'off-icp',
          issue: 'No copy to evaluate against the ICP.',
          suggestion: `Add copy that speaks to ${icp.firmographics.find((f) => f.label === 'Buyer')?.value ?? 'the buyer'} and a pain like "${icp.pains[0]}".`,
        })
        continue
      }
      const hit = pains.some((p) => text.includes(p))
      if (!hit) {
        flags.push({
          rowId: r.id,
          assetName: r.assetName,
          channel: r.channel,
          verdict: 'drift',
          issue: "Doesn't reference the ICP's core pains or promise.",
          suggestion: `Tie the message to "${icp.pains[0]}" / "${icp.pains[1]}" for ${icp.name}.`,
        })
      }
    }

    const total = batch.length || 1
    const off = flags.length
    const onRatio = (total - off) / total
    const campaigns = new Set(batch.map((r) => r.campaign).filter(Boolean))

    const verdict: BatchReview['verdict'] = off / total < 0.2 ? 'coherent' : off / total < 0.5 ? 'mixed' : 'incoherent'
    const oneStory = onRatio >= 0.6 && campaigns.size <= 1

    const parts: string[] = []
    parts.push(`${total - off} of ${total} assets speak to ${icp.name}.`)
    if (off > 0) parts.push(`${off} drift off-message — mostly missing the ${icp.pains[0]}/${icp.pains[2] ?? icp.pains[1]} angle.`)
    if (campaigns.size > 1) parts.push(`Batch spans ${campaigns.size} campaigns (${[...campaigns].join(', ')}) — confirm they share one promise and voice.`)
    parts.push(oneStory ? 'Reads as one coherent story.' : 'Does not yet tell one story to one buyer.')

    return { verdict, oneStory, summary: parts.join(' '), flags }
  }
}
