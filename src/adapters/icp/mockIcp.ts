import type { TrafficRow } from '../../domain/types'
import { messagingFields, messagingMap } from '../../domain/messaging'
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

/** True once an edit has brought a flagged component back in line with the ICP. */
export function flagResolved(flag: AssetFlag, row: TrafficRow, pains: string[]): boolean {
  const map = messagingMap(row)
  if (flag.verdict === 'off-icp') return Object.values(map).some((v) => v.trim())
  if (flag.field) {
    const text = map[flag.field.key] ?? ''
    return text.trim() !== '' && textOnMessage(text, pains)
  }
  return false
}

/** Does this text connect to any of the ICP's pains/promise? */
export function textOnMessage(text: string, pains: string[]): boolean {
  const t = text.toLowerCase()
  return pains.some((p) => t.includes(p.toLowerCase()))
}

/**
 * Heuristic stand-in for the Claude batch review. Evaluates the to-be-scheduled
 * set TOGETHER and flags the specific messaging COMPONENTS that drift from the
 * ICP. Swap for a real adapter that sends the ICP + all assets to Claude in one
 * call (server-side).
 */
export class MockIcpReviewer implements IcpReviewer {
  async review(icp: Icp, rows: TrafficRow[]): Promise<BatchReview> {
    const batch = rows.filter(reviewable)
    const pains = icp.pains
    const buyer = icp.firmographics.find((x) => x.label === 'Buyer')?.value ?? 'the buyer'
    const flags: AssetFlag[] = []

    for (const r of batch) {
      const map = messagingMap(r)
      const fields = messagingFields(r.channel, r.assetType)
      const filled = fields.filter((fl) => (map[fl.key] ?? '').trim())

      if (filled.length === 0) {
        flags.push({
          rowId: r.id,
          assetName: r.assetName,
          channel: r.channel,
          verdict: 'off-icp',
          issue: 'No messaging to evaluate against the ICP.',
          suggestion: `Write copy that speaks to ${buyer} and a pain like "${pains[0]}".`,
        })
        continue
      }

      for (const fl of filled) {
        if (!textOnMessage(map[fl.key], pains)) {
          flags.push({
            rowId: r.id,
            assetName: r.assetName,
            channel: r.channel,
            verdict: 'drift',
            field: { key: fl.key, label: fl.label },
            issue: `${fl.label} doesn't connect to the ICP's pains or promise.`,
            suggestion: `Tie ${fl.label.toLowerCase()} to "${pains[0]}" / "${pains[2] ?? pains[1]}" for ${icp.name}.`,
          })
        }
      }
    }

    const flaggedAssets = new Set(flags.map((x) => x.rowId)).size
    const total = batch.length || 1
    const onRatio = (total - flaggedAssets) / total
    const campaigns = new Set(batch.map((r) => r.campaign).filter(Boolean))

    const verdict: BatchReview['verdict'] =
      flaggedAssets / total < 0.2 ? 'coherent' : flaggedAssets / total < 0.5 ? 'mixed' : 'incoherent'
    const oneStory = onRatio >= 0.6 && campaigns.size <= 1

    const parts: string[] = []
    parts.push(`${total - flaggedAssets} of ${total} assets are on-message for ${icp.name}.`)
    if (flags.length > 0) parts.push(`${flags.length} messaging components drift — mostly missing the ${pains[0]}/${pains[2] ?? pains[1]} angle.`)
    if (campaigns.size > 1) parts.push(`Batch spans ${campaigns.size} campaigns (${[...campaigns].join(', ')}) — confirm one promise and voice.`)
    parts.push(oneStory ? 'Reads as one coherent story.' : 'Does not yet tell one story to one buyer.')

    return { verdict, oneStory, summary: parts.join(' '), flags }
  }
}
