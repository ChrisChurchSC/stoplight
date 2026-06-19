import { clientForCampaign, type ClientProfile } from '../../domain/clients'
import type { MessagingField } from '../../domain/messaging'
import type { Rtb } from '../../domain/rtb'
import type { ChannelId } from '../../domain/types'
import type { Icp } from '../icp/types'

/**
 * Drafts starter copy + proof for a campaign's assets, grounded in the ICP.
 * The real writer calls Claude server-side; the heuristic writer is the offline
 * fallback so drafting works with no API key. Mirrors the ICP-review seam.
 */

export interface DraftAsset {
  rowId: string
  assetName: string
  channel: ChannelId
  type?: string
  /** The messaging components to write, with their char limits. */
  fields: MessagingField[]
}
export interface DraftRequest {
  icp: Icp | null
  campaign: string
  /** The client's brand profile (website / industry / voice), if captured. */
  brand?: ClientProfile
  assets: DraftAsset[]
}
export interface DraftComponent {
  key: string
  value: string
}
export interface AssetDraft {
  rowId: string
  components: DraftComponent[]
  /** Campaign RTB ids this asset leans on (proof carried into the funnel). */
  rtbIds: string[]
}
export interface DraftResult {
  rtbs: Rtb[]
  drafts: AssetDraft[]
}

export interface CopyWriter {
  draft(req: DraftRequest): Promise<DraftResult>
}

/**
 * Real writer: POSTs to the server-side /api/draft-copy endpoint (which calls
 * Claude). Falls back to the heuristic writer when the backend is absent, has no
 * API key (501), or errors — so drafting always works, key or not.
 */
export class ClaudeCopyWriter implements CopyWriter {
  constructor(private fallback: CopyWriter) {}

  async draft(req: DraftRequest): Promise<DraftResult> {
    try {
      const res = await fetch('/api/draft-copy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      })
      if (!res.ok) throw new Error(`draft-copy ${res.status}`)
      const out = (await res.json()) as DraftResult
      if (!out?.drafts?.length) throw new Error('empty draft')
      return out
    } catch {
      return this.fallback.draft(req)
    }
  }
}

// ---- Heuristic fallback: deterministic, ICP-aware starter copy ----

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const clip = (s: string, max?: number) =>
  max && s.length > max ? s.slice(0, Math.max(1, max - 1)).trimEnd() + '…' : s
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 15)

const CTAS = ['Get started', 'Learn more', 'See how it works', 'Book a demo', 'Get the guide']

export class HeuristicCopyWriter implements CopyWriter {
  async draft(req: DraftRequest): Promise<DraftResult> {
    const { icp, campaign, assets } = req
    const pains = icp?.pains?.length ? icp.pains : ['manual work', 'slow tools', 'wasted time']
    const buyer = icp?.firmographics?.find((f) => f.label === 'Buyer')?.value ?? icp?.name ?? 'your team'
    const client = clientForCampaign(campaign) ?? campaign.split('—').pop()?.trim() ?? 'We'

    // 3 starter campaign RTBs derived from the top pains (the user edits these).
    const rtbs: Rtb[] = pains.slice(0, 3).map((p, i) => ({
      id: `proof-${i + 1}`,
      label: cap(`cut ${p}`),
      detail: `Backs the campaign promise on ${p}.`,
    }))
    if (rtbs.length === 0)
      rtbs.push({ id: 'proof-1', label: 'Proven results', detail: 'Add your proof point.' })

    const drafts: AssetDraft[] = assets.map((a, i) => {
      const ctx = { pain: pains[i % pains.length], pain2: pains[(i + 1) % pains.length], buyer, client, asset: a }
      const components: DraftComponent[] = a.fields.map((fl, fi) => ({
        key: fl.key,
        value: clip(componentCopy(fl, { ...ctx, ctaIdx: i + fi }), fl.hardLimit),
      }))
      // Landing pages are the proof hub (carry all RTBs); other assets lean on a
      // rotating one, so an asset and the page it drives to always share proof.
      const rtbIds = a.channel === 'landing-page' ? rtbs.map((r) => r.id) : [rtbs[i % rtbs.length].id]
      return { rowId: a.rowId, components, rtbIds }
    })
    return { rtbs, drafts }
  }
}

function componentCopy(
  fl: MessagingField,
  ctx: { pain: string; pain2: string; buyer: string; client: string; asset: DraftAsset; ctaIdx: number },
): string {
  const k = fl.key.toLowerCase()
  const { pain, pain2, buyer, client, asset } = ctx
  if (/cta/.test(k) || fl.label.toLowerCase() === 'cta') return CTAS[ctx.ctaIdx % CTAS.length]
  if (/^path$/.test(k)) return slug(asset.assetName)
  if (/business|brand/.test(k)) return client
  if (/subject/.test(k)) return `${cap(buyer)}: end ${pain} for good`
  if (/preview/.test(k)) return `A faster way past ${pain}.`
  if (/when/.test(k)) return 'Live · date TBD'
  if (/headline|^h\d|title|subhead|long-headline/.test(k)) return cap(`cut ${pain} without the ${pain2}`)
  // primary / body / intro / post / description / caption / message / d1 / d2 …
  return `${cap(buyer)} lose hours to ${pain} and ${pain2}. ${asset.assetName} shows a faster path, built for how ${buyer} actually work.`
}
