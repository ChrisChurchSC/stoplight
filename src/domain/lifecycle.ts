/**
 * Campaign lifecycle: where a campaign sits in its life, and the signals that
 * decide it. The brand dashboard (CampaignStatesHome) groups a brand's campaigns
 * by this state — Active and Planning are the headline views; In Review and
 * Completed live in the flow. The states are the pipeline that feeds the moat:
 * completed campaigns' learning flows back into planning.
 *
 * State is DERIVED from a campaign's rows when not set explicitly, so existing
 * and sample campaigns slot in without tagging. An explicit Campaign.status
 * overrides the derivation (the user sends a campaign to review or marks it
 * complete; later the approval gate and publish step set it too).
 */
import type { Campaign } from './clients'
import type { TrafficRow } from './types'
import { type CoherenceBreak, openBreaks } from './breaks'

export type CampaignStatus = 'planning' | 'in-review' | 'active' | 'completed'

/** Display order: the two headline states first, then the in-flow states. */
export const CAMPAIGN_STATUSES: CampaignStatus[] = ['active', 'planning', 'in-review', 'completed']

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  active: 'Active',
  planning: 'Planning',
  'in-review': 'In Review',
  completed: 'Completed',
}

/** One-line "what this state is for", shown under each section heading. */
export const STATUS_BLURB: Record<CampaignStatus, string> = {
  active: 'Live now — what needs you.',
  planning: "What's coming — get it to approved.",
  'in-review': 'Waiting on the approval gate.',
  completed: 'Finished — what worked feeds the next plan.',
}

export interface CampaignStats {
  /** Distinct asset names in the campaign. */
  assets: number
  rows: number
  draft: number
  approved: number
  scheduled: number
  posted: number
}

export function campaignStats(rows: TrafficRow[]): CampaignStats {
  const assets = new Set(rows.map((r) => r.assetName)).size
  const by = (s: TrafficRow['status']) => rows.filter((r) => r.status === s).length
  return {
    assets,
    rows: rows.length,
    draft: by('draft'),
    approved: by('approved'),
    scheduled: by('scheduled'),
    posted: by('posted'),
  }
}

/**
 * Derive a campaign's lifecycle state from its rows. Explicit Campaign.status
 * always wins; this is the fallback so untagged campaigns still group.
 *
 *  - active:    anything live or going live (a scheduled or posted row). A
 *               current-state "live messaging" map lands here too — it's the
 *               brand's live baseline, the thing to monitor, not something done.
 *  - in-review: work has passed the gate (approved rows) but nothing is live yet.
 *  - planning:  only drafts, or no rows yet — still being built.
 *
 * Completed is a DELIBERATE end-state (where learning lives), so it is never
 * derived — a campaign reaches it only when explicitly marked done. That keeps
 * an always-posted live baseline from masquerading as "finished".
 */
export function deriveCampaignStatus(
  campaign: Campaign | undefined,
  rows: TrafficRow[],
): CampaignStatus {
  if (campaign?.status) return campaign.status
  if (rows.length === 0) return 'planning'
  const s = campaignStats(rows)
  if (s.scheduled + s.posted > 0) return 'active'
  if (s.approved > 0) return 'in-review'
  return 'planning'
}

/** Open breaks that belong to a campaign (by campaign name or an in-scope asset). */
export function breaksForCampaign(
  name: string,
  assetNames: Set<string>,
  breaks: CoherenceBreak[],
): CoherenceBreak[] {
  return openBreaks(
    breaks.filter(
      (b) =>
        b.campaign === name ||
        assetNames.has(b.from.assetName) ||
        (b.to ? assetNames.has(b.to.assetName) : false),
    ),
  )
}

export type AttentionKind = 'coherence' | 'recheck' | 'approval' | 'performance'

export interface AttentionFlag {
  kind: AttentionKind
  label: string
  severity: 'high' | 'medium' | 'low'
}

export interface CampaignAttention {
  flags: AttentionFlag[]
  /** Total flags raised — used to sort the Active list "what needs me" first. */
  count: number
}

const ATTENTION_RANK: Record<AttentionFlag['severity'], number> = { high: 0, medium: 1, low: 2 }

export interface AttentionInput {
  rows: TrafficRow[]
  /** Open coherence breaks already scoped to this campaign. */
  breaks: CoherenceBreak[]
  /** ROAS for the campaign, or null when there's no spend yet. */
  roas: number | null
  spend: number
}

/**
 * "What needs me?" for a live campaign — the triage signals, prioritized: a
 * coherence break (the thread frays), a produced asset that fell off its proof
 * after a frame change (re-check), an unapproved asset (work stuck before it can
 * ship), and underperformance (spend without return).
 */
export function campaignAttention({ rows, breaks, roas, spend }: AttentionInput): CampaignAttention {
  const flags: AttentionFlag[] = []
  const open = breaks.length
  if (open > 0)
    flags.push({
      kind: 'coherence',
      label: `${open} coherence break${open === 1 ? '' : 's'}`,
      severity: 'high',
    })
  const reflag = rows.filter((r) => r.recheckFlag).length
  if (reflag > 0)
    flags.push({ kind: 'recheck', label: `${reflag} to re-check`, severity: 'high' })
  const awaiting = rows.filter((r) => r.status === 'draft').length
  if (awaiting > 0)
    flags.push({ kind: 'approval', label: `${awaiting} awaiting approval`, severity: 'medium' })
  if (spend > 0 && roas !== null && roas < 1)
    flags.push({
      kind: 'performance',
      label: `Underperforming (${roas.toFixed(1)}× ROAS)`,
      severity: 'medium',
    })
  flags.sort((a, b) => ATTENTION_RANK[a.severity] - ATTENTION_RANK[b.severity])
  return { flags, count: flags.length }
}

export interface MomentumStep {
  label: string
  done: boolean
}

export interface CampaignMomentum {
  /** How many of the beats are done (0–3). */
  step: number
  steps: MomentumStep[]
  pct: number
}

/**
 * For a Planning campaign the job is momentum — get to approved. Three beats:
 * assets built, sent to review, approved. The card shows what's left before it
 * can go live.
 */
export function campaignMomentum(rows: TrafficRow[]): CampaignMomentum {
  const s = campaignStats(rows)
  const built = s.rows > 0
  const reviewed = s.approved + s.scheduled + s.posted > 0
  const approved = s.rows > 0 && s.draft === 0
  const steps: MomentumStep[] = [
    { label: 'Built', done: built },
    { label: 'Reviewed', done: reviewed },
    { label: 'Approved', done: approved },
  ]
  const step = steps.filter((x) => x.done).length
  return { step, steps, pct: Math.round((step / steps.length) * 100) }
}
