import { freshRecordId, type RecordColumn, type RecordField } from './records'

/**
 * A Brand record — the "Records › Brands" sheet: your own brands / clients, the entities you build
 * Flows, a Library, and Insights FOR (distinct from Audience › Companies, who you target). Backed
 * by a store slice like the other record sheets, and synced into the real client system so a named
 * brand becomes a usable workspace brand. (Distinct from domain/brand.ts, which is brand-scope.)
 */
export interface BrandRecord {
  id: string
  name: string
  industry?: string
  website?: string
  status?: 'active' | 'prospect' | 'paused' | ''
  owner?: string
  notes?: string
  /** Brand profile picture / avatar — a compact data URL (uploaded, resized) or image URL. Keyed to
   *  the record id, so it can be set before the brand is named and survives a rename. */
  pfp?: string
  // ---- Communications strategy (the brand's own EVERGREEN strategy document) ----
  // Overview / header
  descriptor?: string
  strategyOwner?: string
  reviewCycle?: string
  // Strategic Foundation
  businessObjective?: string
  commsObjective?: string
  positioning?: string
  primaryAudience?: string
  audienceInsight?: string
  competitiveContext?: string
  /** @deprecated Legacy single-string alias, and the Brand sheet's newline-separated store, for
   *  differentiators. Always read via brandDifferentiators() / brandDifferentiatorText(). */
  differentiator?: string
  /** One or more differentiators. The sheet edits the newline-separated `differentiator` string;
   *  structured writers may also set this array. Always read via brandDifferentiators(). */
  differentiators?: string[]
  // Message Architecture
  keyMessage?: string
  supportingMessages?: string
  proofPoints?: string
  toneOfVoice?: string
  languageDos?: string
  languageDonts?: string
  contentPillars?: string
  // Governance
  reviewCadence?: string
  risks?: string
  // ---- @deprecated: campaign-level, now owned by the Campaign. No readers; kept ONLY so existing
  //      stoplight.brandRecords.v1 blobs round-trip untouched. Not surfaced on the Brand sheet. ----
  /** @deprecated Budget lives on Campaign.overallBudget / mediaBudget. */
  budgetSplit?: string
  /** @deprecated KPI lives on Campaign.goalKpi (a linked Objective). */
  primaryKpis?: string
  /** @deprecated Target lives on Campaign.goalTarget. */
  headlineTargets?: string
  /** @deprecated Channels = campaign references (type 'channel') + shared Channel records. */
  primaryChannels?: string
  /** @deprecated See primaryChannels. */
  secondaryChannels?: string
  /** @deprecated Cadence = Campaign.contentPerMonth / oneTimeAssets / durationWeeks. */
  cadence?: string
  /** @deprecated Each key moment is itself a Campaign. */
  keyMoments?: string
}

// The full communications strategy as columns, grouped into the same section bands the drawer uses
// (Overview / Strategic Foundation / Message Architecture / Execution / Measurement) — so the Brand
// sheet reads like every other record table, with the sections as column-group bands.
/** Review-cadence pick-list, shared by the brief's two cadence fields. */
export const REVIEW_CADENCE_OPTIONS = ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Annually'] as const

/** The brand's differentiators as a list. The sheet stores them as a newline-separated string
 *  (`differentiator`); structured writers may also set the `differentiators` array. Prefer the
 *  string (the human-edited sheet value) when present so the two can't drift, else the array. */
export function brandDifferentiators(rec: Pick<BrandRecord, 'differentiator' | 'differentiators'>): string[] {
  const s = (rec.differentiator ?? '').trim()
  if (s) return s.split(/[\n;]+/).map((x) => x.trim()).filter(Boolean)
  return (rec.differentiators ?? []).map((x) => x.trim()).filter(Boolean)
}

/** The differentiators joined into one inline string, for prompts / single-value display. */
export function brandDifferentiatorText(rec: Pick<BrandRecord, 'differentiator' | 'differentiators'>): string {
  return brandDifferentiators(rec).join('; ')
}

export const BRAND_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Brand', kind: 'name', width: 200, group: 'Overview' },
  { key: 'descriptor', label: 'Descriptor', kind: 'text', width: 240, group: 'Overview' },
  { key: 'status', label: 'Status', kind: 'status', width: 120, group: 'Overview' },
  { key: 'strategyOwner', label: 'Strategy owner', kind: 'text', width: 150, group: 'Overview' },
  { key: 'reviewCycle', label: 'Review cadence', kind: 'text', width: 150, group: 'Overview', options: REVIEW_CADENCE_OPTIONS },
  { key: 'industry', label: 'Industry', kind: 'text', width: 170, group: 'Overview' },
  { key: 'website', label: 'Website', kind: 'url', width: 180, group: 'Overview' },
  { key: 'businessObjective', label: 'Business objective', kind: 'text', width: 300, group: 'Strategic Foundation' },
  { key: 'commsObjective', label: 'Comms objective', kind: 'text', width: 280, group: 'Strategic Foundation' },
  { key: 'positioning', label: 'Positioning', kind: 'text', width: 300, group: 'Strategic Foundation' },
  { key: 'primaryAudience', label: 'Primary audience', kind: 'text', width: 260, group: 'Strategic Foundation' },
  { key: 'audienceInsight', label: 'Audience insight', kind: 'text', width: 260, group: 'Strategic Foundation' },
  { key: 'competitiveContext', label: 'Competitive context', kind: 'text', width: 260, group: 'Strategic Foundation' },
  { key: 'differentiator', label: 'Differentiators', kind: 'text', width: 240, group: 'Strategic Foundation' },
  { key: 'keyMessage', label: 'Key message', kind: 'text', width: 280, group: 'Message Architecture' },
  { key: 'supportingMessages', label: 'Supporting messages', kind: 'text', width: 280, group: 'Message Architecture' },
  { key: 'proofPoints', label: 'Proof points', kind: 'text', width: 280, group: 'Message Architecture' },
  { key: 'toneOfVoice', label: 'Tone of voice', kind: 'text', width: 220, group: 'Message Architecture' },
  { key: 'languageDos', label: "Language do's", kind: 'text', width: 200, group: 'Message Architecture' },
  { key: 'languageDonts', label: "Language don'ts", kind: 'text', width: 200, group: 'Message Architecture' },
  { key: 'contentPillars', label: 'Content pillars', kind: 'text', width: 220, group: 'Message Architecture' },
  { key: 'reviewCadence', label: 'Review cadence', kind: 'text', width: 180, group: 'Governance', options: REVIEW_CADENCE_OPTIONS },
  { key: 'risks', label: 'Risks & watch-outs', kind: 'text', width: 240, group: 'Governance' },
]

// The full Communications Strategy, grouped into sections (shown in the record drawer).
export const BRAND_FIELDS: RecordField[] = [
  { key: 'name', label: 'Brand', kind: 'name', group: 'Overview' },
  { key: 'descriptor', label: 'Brand descriptor', kind: 'text', group: 'Overview' },
  { key: 'status', label: 'Status', kind: 'status', group: 'Overview' },
  { key: 'strategyOwner', label: 'Strategy owner', kind: 'text', group: 'Overview' },
  { key: 'reviewCycle', label: 'Review cadence', kind: 'text', group: 'Overview', options: REVIEW_CADENCE_OPTIONS },
  { key: 'industry', label: 'Industry', kind: 'text', group: 'Overview' },
  { key: 'website', label: 'Website', kind: 'url', group: 'Overview' },
  { key: 'businessObjective', label: 'Business objective', kind: 'multiline', group: 'Strategic Foundation' },
  { key: 'commsObjective', label: 'Comms objective', kind: 'multiline', group: 'Strategic Foundation' },
  { key: 'positioning', label: 'Positioning statement', kind: 'multiline', group: 'Strategic Foundation' },
  { key: 'primaryAudience', label: 'Primary audience', kind: 'multiline', group: 'Strategic Foundation' },
  { key: 'audienceInsight', label: 'Audience insight', kind: 'multiline', group: 'Strategic Foundation' },
  { key: 'competitiveContext', label: 'Competitive context', kind: 'multiline', group: 'Strategic Foundation' },
  { key: 'differentiator', label: 'Differentiators', kind: 'multiline', group: 'Strategic Foundation' },
  { key: 'keyMessage', label: 'Key message', kind: 'multiline', group: 'Message Architecture' },
  { key: 'supportingMessages', label: 'Supporting messages', kind: 'multiline', group: 'Message Architecture' },
  { key: 'proofPoints', label: 'Proof points', kind: 'multiline', group: 'Message Architecture' },
  { key: 'toneOfVoice', label: 'Tone of voice', kind: 'multiline', group: 'Message Architecture' },
  { key: 'languageDos', label: "Language do's", kind: 'multiline', group: 'Message Architecture' },
  { key: 'languageDonts', label: "Language don'ts", kind: 'multiline', group: 'Message Architecture' },
  { key: 'contentPillars', label: 'Content pillars', kind: 'multiline', group: 'Message Architecture' },
  { key: 'reviewCadence', label: 'Review cadence', kind: 'text', group: 'Governance', options: REVIEW_CADENCE_OPTIONS },
  { key: 'risks', label: 'Risks & watch-outs', kind: 'multiline', group: 'Governance' },
]

export const BRAND_STATUSES: NonNullable<BrandRecord['status']>[] = ['active', 'prospect', 'paused']

export function freshBrandRecordId(): string {
  return freshRecordId('brd')
}

/** Seed brand records from the real workspace brands (names + any known profile). */
export function seedBrandRecords(
  names: string[],
  profiles: Record<string, { industry?: string; website?: string }>,
): BrandRecord[] {
  return names.map((n) => ({
    id: freshBrandRecordId(),
    name: n,
    industry: profiles[n]?.industry,
    website: profiles[n]?.website,
    status: 'active' as const,
  }))
}
