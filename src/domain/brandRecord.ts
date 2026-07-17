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
  // ---- Communications strategy (the brand's own strategy document) ----
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
  differentiator?: string
  // Message Architecture
  keyMessage?: string
  supportingMessages?: string
  proofPoints?: string
  toneOfVoice?: string
  languageDos?: string
  languageDonts?: string
  // Execution
  primaryChannels?: string
  secondaryChannels?: string
  contentPillars?: string
  cadence?: string
  budgetSplit?: string
  keyMoments?: string
  // Measurement & Governance
  primaryKpis?: string
  headlineTargets?: string
  reviewCadence?: string
  risks?: string
}

// The full communications strategy as columns, grouped into the same section bands the drawer uses
// (Overview / Strategic Foundation / Message Architecture / Execution / Measurement) — so the Brand
// sheet reads like every other record table, with the sections as column-group bands.
/** Review-cadence pick-list, shared by the brief's two cadence fields. */
export const REVIEW_CADENCE_OPTIONS = ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Annually'] as const

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
  { key: 'differentiator', label: 'Differentiator', kind: 'text', width: 240, group: 'Strategic Foundation' },
  { key: 'keyMessage', label: 'Key message', kind: 'text', width: 280, group: 'Message Architecture' },
  { key: 'supportingMessages', label: 'Supporting messages', kind: 'text', width: 280, group: 'Message Architecture' },
  { key: 'proofPoints', label: 'Proof points', kind: 'text', width: 280, group: 'Message Architecture' },
  { key: 'toneOfVoice', label: 'Tone of voice', kind: 'text', width: 220, group: 'Message Architecture' },
  { key: 'languageDos', label: "Language do's", kind: 'text', width: 200, group: 'Message Architecture' },
  { key: 'languageDonts', label: "Language don'ts", kind: 'text', width: 200, group: 'Message Architecture' },
  { key: 'primaryChannels', label: 'Primary channels', kind: 'text', width: 220, group: 'Execution' },
  { key: 'secondaryChannels', label: 'Secondary channels', kind: 'text', width: 220, group: 'Execution' },
  { key: 'contentPillars', label: 'Content pillars', kind: 'text', width: 220, group: 'Execution' },
  { key: 'cadence', label: 'Cadence', kind: 'text', width: 180, group: 'Execution' },
  { key: 'budgetSplit', label: 'Budget split', kind: 'text', width: 180, group: 'Execution' },
  { key: 'keyMoments', label: 'Key moments', kind: 'text', width: 240, group: 'Execution' },
  { key: 'primaryKpis', label: 'Primary KPIs', kind: 'text', width: 220, group: 'Measurement' },
  { key: 'headlineTargets', label: 'Headline targets', kind: 'text', width: 220, group: 'Measurement' },
  { key: 'reviewCadence', label: 'Review cadence', kind: 'text', width: 180, group: 'Measurement', options: REVIEW_CADENCE_OPTIONS },
  { key: 'risks', label: 'Risks & watch-outs', kind: 'text', width: 240, group: 'Measurement' },
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
  { key: 'differentiator', label: 'Differentiator', kind: 'multiline', group: 'Strategic Foundation' },
  { key: 'keyMessage', label: 'Key message', kind: 'multiline', group: 'Message Architecture' },
  { key: 'supportingMessages', label: 'Supporting messages', kind: 'multiline', group: 'Message Architecture' },
  { key: 'proofPoints', label: 'Proof points', kind: 'multiline', group: 'Message Architecture' },
  { key: 'toneOfVoice', label: 'Tone of voice', kind: 'multiline', group: 'Message Architecture' },
  { key: 'languageDos', label: "Language do's", kind: 'multiline', group: 'Message Architecture' },
  { key: 'languageDonts', label: "Language don'ts", kind: 'multiline', group: 'Message Architecture' },
  { key: 'primaryChannels', label: 'Primary channels', kind: 'multiline', group: 'Execution' },
  { key: 'secondaryChannels', label: 'Secondary channels', kind: 'multiline', group: 'Execution' },
  { key: 'contentPillars', label: 'Content pillars', kind: 'multiline', group: 'Execution' },
  { key: 'cadence', label: 'Cadence', kind: 'multiline', group: 'Execution' },
  { key: 'budgetSplit', label: 'Budget split', kind: 'multiline', group: 'Execution' },
  { key: 'keyMoments', label: 'Key moments / campaigns', kind: 'multiline', group: 'Execution' },
  { key: 'primaryKpis', label: 'Primary KPIs', kind: 'multiline', group: 'Measurement' },
  { key: 'headlineTargets', label: 'Headline targets', kind: 'multiline', group: 'Measurement' },
  { key: 'reviewCadence', label: 'Review cadence', kind: 'text', group: 'Measurement', options: REVIEW_CADENCE_OPTIONS },
  { key: 'risks', label: 'Risks & watch-outs', kind: 'multiline', group: 'Measurement' },
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
