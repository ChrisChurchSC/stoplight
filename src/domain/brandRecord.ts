import { freshRecordId, type RecordColumn, type RecordField } from './records'
import { INDUSTRIES } from './taxonomy'

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
  /** @deprecated The brand's voice lives in ONE place: ClientProfile.voice + voiceGuide (the Brand
   *  Voice tab), which is what copy generation reads. This sheet field was a dead duplicate; kept so
   *  old blobs round-trip, not surfaced on the Brand sheet. The Voices record page is a library of
   *  variant voices, distinct from the brand's core voice. */
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
 *  (`differentiator`); structured writers may also set the `differentiators` array. The sheet
 *  string is authoritative whenever it has been SET — including when the user explicitly cleared it
 *  to '' — so clearing the cell truly clears the differentiators and a previously-written array can
 *  never resurrect deleted values. Fall back to the array only when the string was never set. */
export function brandDifferentiators(rec: Pick<BrandRecord, 'differentiator' | 'differentiators'>): string[] {
  if (typeof rec.differentiator === 'string') {
    return rec.differentiator.trim() ? rec.differentiator.split(/[\n;]+/).map((x) => x.trim()).filter(Boolean) : []
  }
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
  { key: 'industry', label: 'Industry', kind: 'text', width: 170, group: 'Overview', options: INDUSTRIES },
  { key: 'website', label: 'Website', kind: 'url', width: 180, group: 'Overview' },
  { key: 'businessObjective', label: 'Business objective', kind: 'text', width: 300, group: 'Strategic Foundation' },
  { key: 'commsObjective', label: 'Comms objective', kind: 'text', width: 280, group: 'Strategic Foundation' },
  { key: 'positioning', label: 'Positioning statement', kind: 'text', width: 300, group: 'Strategic Foundation' },
  { key: 'primaryAudience', label: 'Primary audience', kind: 'text', width: 260, group: 'Strategic Foundation' },
  { key: 'audienceInsight', label: 'Audience insight', kind: 'text', width: 260, group: 'Strategic Foundation' },
  { key: 'competitiveContext', label: 'Competitive context', kind: 'text', width: 260, group: 'Strategic Foundation' },
  { key: 'differentiator', label: 'Differentiators', kind: 'text', width: 240, group: 'Strategic Foundation' },
  { key: 'keyMessage', label: 'Key message', kind: 'text', width: 280, group: 'Message Architecture' },
  { key: 'supportingMessages', label: 'Supporting messages', kind: 'text', width: 280, group: 'Message Architecture' },
  { key: 'proofPoints', label: 'Proof points (summary)', kind: 'text', width: 280, group: 'Message Architecture' },
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
  { key: 'industry', label: 'Industry', kind: 'text', group: 'Overview', options: INDUSTRIES },
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
  { key: 'proofPoints', label: 'Proof points (summary)', kind: 'multiline', group: 'Message Architecture' },
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

/**
 * The first-run review of the drafted brand page (BrandDraftReview.tsx).
 *
 * The drafter's response schema marks all 26 fields required, so from one sentence of input it is
 * structurally obliged to answer questions it has no way to know. These two lists split what it
 * writes into "check this first" and "the rest", ranked by how far a wrong value travels rather
 * than by the order the sheet happens to show them in.
 *
 * Kept here beside BRAND_FIELDS so adding a field is one edit, not two files out of step.
 */
export const REVIEW_PRIORITY_KEYS: (keyof BrandRecord)[] = [
  'positioning',        // widest read surface, including askBrand
  'businessObjective',  // drives the angle drafter's stage and outcome
  'primaryAudience',    // reaches the campaign chat's brandFacts, so it gets repeated back as fact
  'differentiator',     // the field most often invented as a product capability
  'descriptor',         // one phrase, cheapest possible correction
  'keyMessage',         // propagates into saved library items, so a wrong one is sticky
  'competitiveContext', // nothing reads it, and it is the most confidently fabricated. Here to be emptied.
]

/** Also written by the draft, shown collapsed. Same provenance rules, lower blast radius. */
export const REVIEW_SECONDARY_KEYS: (keyof BrandRecord)[] = [
  'commsObjective', 'audienceInsight', 'supportingMessages', 'proofPoints',
  'languageDos', 'languageDonts', 'contentPillars', 'reviewCadence', 'risks',
]

/** Every record field the brand draft can write, and therefore every one the review can correct. */
export const REVIEW_RECORD_KEYS: (keyof BrandRecord)[] = [...REVIEW_PRIORITY_KEYS, ...REVIEW_SECONDARY_KEYS]
