import type { TrafficRow } from './types'
import { messagingAllText } from './messaging'

/** One recorded outcome for an RTB — its per-use track record. Empty until
 *  attribution flows back; the structure exists from day one so an RTB can
 *  accumulate history ("objects that remember"). */
export interface RtbOutcome {
  /** Campaign the proof was deployed in. */
  campaign: string
  /** Asset that carried the claim, when known. */
  assetId?: string
  /** Coarse result now; numeric attribution can refine later. */
  result: 'won' | 'engaged' | 'flat'
  /** Attributed revenue, when known. */
  revenue?: number
  at: number
}

/**
 * A Reason to Believe — a proof point that substantiates a claim. RTBs are
 * first-class objects OWNED BY a single audience in the foundation (proof belongs
 * to the audience it persuades); they travel with the audience into campaigns and
 * accumulate their own per-audience track record via `outcomes`.
 */
export interface Rtb {
  id: string
  label: string
  detail: string
  /** The audience that owns this proof (foundation). Absent on legacy
   *  campaign-seeded RTBs that haven't been migrated to an owner yet. */
  audienceId?: string
  /** Quantified version of the claim, if any (e.g. "40% faster"). */
  metric?: string
  /** Where the proof comes from (e.g. "Acme case study", benchmark, survey). */
  source?: string
  /** Library governance: an approved proof is a blessed, on-brand master you can
   *  pull with confidence; an unapproved one is an unvetted draft (e.g. authored
   *  on the canvas, not yet reviewed). Undefined = approved (legacy masters);
   *  only an explicit `false` marks a draft, so existing data reads as approved. */
  approved?: boolean
  /** This proof's track record — what it converted, where it fell flat. Starts
   *  empty; the rank/reuse intelligence reads this once outcomes accrue. */
  outcomes?: RtbOutcome[]
}

/** A proof is a vetted library master unless explicitly marked an unapproved draft. */
export const isApprovedProof = (r: Rtb): boolean => r.approved !== false

let rtbSeq = 0
/** A fresh owned RTB. Pass the owning audience so proof is audience-scoped. */
export function newRtb(patch: Partial<Rtb> & { audienceId: string }): Rtb {
  rtbSeq += 1
  return {
    id: patch.id ?? `rtb_${Date.now().toString(36)}_${rtbSeq}`,
    label: patch.label ?? '',
    detail: patch.detail ?? '',
    outcomes: patch.outcomes ?? [],
    ...patch,
  }
}

/**
 * Authored RTB sets per campaign, grounded in the ICP / brand truth. Assets map
 * onto these. (Auto-deriving RTBs from asset content is a later enhancement.)
 */
export const CAMPAIGN_RTBS: Record<string, Rtb[]> = {
  'Spring Launch 2026': [
    { id: 'speed', label: '2x faster builds', detail: 'Benchmark: builds complete in half the time vs the prior release.' },
    { id: 'rollback', label: 'One-click rollback', detail: 'Revert any deploy in one click — ship without fear.' },
    { id: 'redesign', label: 'Redesigned dashboard', detail: 'New dashboard cut time-to-insight in user testing.' },
  ],
  'Q2 Demand Gen': [
    { id: 'acme', label: 'Acme cut ops time 40%', detail: 'Case study: Acme reduced manual ops work 40% in 90 days.' },
    { id: 'integrations', label: '200+ integrations', detail: 'Connects to the tools mid-market ops teams already run.' },
    { id: 'ttv', label: 'Live in a week', detail: 'Median time-to-value is 7 days.' },
  ],
  'Webinar: Scaling Ops': [
    { id: 'panel', label: 'Ops leaders on the panel', detail: 'Speakers are VPs of Ops from Series B+ SaaS companies.' },
    { id: 'playbook', label: 'Takeaway playbook', detail: 'Every attendee gets the scaling-ops playbook.' },
  ],
}

/**
 * Campaign RTBs registered at runtime (e.g. drafted from the ICP for a
 * wizard-seeded campaign that has no authored set above). Overrides CAMPAIGN_RTBS.
 */
const runtimeRtbs = new Map<string, Rtb[]>()
export function registerCampaignRtbs(campaign: string, rtbs: Rtb[]): void {
  if (campaign) runtimeRtbs.set(campaign, rtbs)
}

/** The proof points owned by one audience (foundation). */
export const rtbsForAudience = (audience: { rtbs?: Rtb[] } | undefined): Rtb[] => audience?.rtbs ?? []

/** Dedupe a set of audiences' RTBs by id — a campaign's available proof is the
 *  union of the proof owned by the audiences it draws on. */
export function rtbsFromAudiences(audiences: { rtbs?: Rtb[] }[]): Rtb[] {
  const out: Rtb[] = []
  const seen = new Set<string>()
  for (const a of audiences) for (const r of a.rtbs ?? []) if (!seen.has(r.id)) { seen.add(r.id); out.push(r) }
  return out
}

/**
 * Audience-sourced RTB resolver. Audiences own their proof now, so the canonical
 * proof for a campaign is the union of its audiences' RTBs. The store installs a
 * resolver (campaign → that campaign's audiences' RTBs) so the many existing
 * `rtbsForCampaign` callers keep working while ownership lives on the audience.
 */
let audienceRtbResolver: ((campaign: string) => Rtb[]) | null = null
export function setAudienceRtbResolver(fn: ((campaign: string) => Rtb[]) | null): void {
  audienceRtbResolver = fn
}

export const rtbsForCampaign = (campaign?: string): Rtb[] => {
  // Audience-owned proof is canonical; fall back to the runtime/seed sets for
  // campaigns whose audiences don't own RTBs yet (legacy demo data).
  const owned = campaign && audienceRtbResolver ? audienceRtbResolver(campaign) : []
  if (owned.length) return owned
  return (campaign ? runtimeRtbs.get(campaign) : undefined) ?? CAMPAIGN_RTBS[campaign ?? ''] ?? []
}

export const rtbById = (campaign: string | undefined, id: string): Rtb | undefined =>
  rtbsForCampaign(campaign).find((r) => r.id === id)

/** All RTB ids an asset carries (union across its messaging components). */
export const assetRtbIds = (row: TrafficRow): string[] => [
  ...new Set(Object.values(row.rtbMap ?? {}).flat()),
]

const reviewable = (r: TrafficRow) => r.status !== 'posted' && r.status !== 'failed'

export interface RtbUse {
  campaign: string
  rtb: Rtb
  uses: number
}

export interface RtbCoverage {
  used: number
  total: number
  byRtb: RtbUse[]
  /** Authored RTBs not used by any asset — proof you have but aren't deploying. */
  gaps: RtbUse[]
  /** A single RTB carrying most of a campaign's proof. */
  overReliance: { campaign: string; rtb: Rtb; share: number } | null
  /** Assets with messaging (a claim) but no RTB mapped — unsupported claims. */
  unsupported: TrafficRow[]
}

export function rtbCoverage(rows: TrafficRow[]): RtbCoverage {
  const batch = rows.filter(reviewable)
  const campaigns = [...new Set(batch.map((r) => r.campaign).filter(Boolean))] as string[]
  const byRtb: RtbUse[] = []
  const perCampaignTotal: Record<string, number> = {}

  for (const campaign of campaigns) {
    const camRows = batch.filter((r) => r.campaign === campaign)
    for (const rtb of rtbsForCampaign(campaign)) {
      const uses = camRows.filter((r) => assetRtbIds(r).includes(rtb.id)).length
      byRtb.push({ campaign, rtb, uses })
      perCampaignTotal[campaign] = (perCampaignTotal[campaign] ?? 0) + uses
    }
  }

  let overReliance: RtbCoverage['overReliance'] = null
  for (const u of byRtb) {
    const camTotal = perCampaignTotal[u.campaign] ?? 0
    if (camTotal >= 3 && u.uses / camTotal > 0.6) {
      overReliance = { campaign: u.campaign, rtb: u.rtb, share: u.uses / camTotal }
      break
    }
  }

  return {
    total: byRtb.length,
    used: byRtb.filter((u) => u.uses > 0).length,
    byRtb,
    gaps: byRtb.filter((u) => u.uses === 0),
    overReliance,
    unsupported: batch.filter((r) => messagingAllText(r).trim() && assetRtbIds(r).length === 0),
  }
}
