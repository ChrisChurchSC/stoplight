/**
 * The shared vocabulary that makes data comparable ACROSS customers. Each brand's audiences and
 * proof points are free text, so "founders" in one workspace can't be compared to "founder-led
 * teams" in another. Normalizing both to a fixed set of persona archetypes / proof types is the
 * prerequisite for any cross-customer learning: the aggregate layer groups on these, not raw
 * strings.
 *
 * Deliberately small + keyword-driven (deterministic, no AI needed). Anything that doesn't match
 * falls to 'other', so the taxonomy degrades gracefully rather than mis-bucketing.
 */

export interface ArchetypeEntry {
  key: string
  label: string
  /** Lowercased substrings that map a raw value here (first entry to match wins). */
  keywords: string[]
}

/** Persona archetypes — the "who" a variant targets, normalized from an audience name. */
export const PERSONA_ARCHETYPES: ArchetypeEntry[] = [
  { key: 'founder', label: 'Founder / Exec', keywords: ['founder', 'ceo', 'cofound', 'owner', 'president', 'exec', 'chief', 'c-suite', 'leadership', 'principal'] },
  { key: 'marketing', label: 'Marketing', keywords: ['market', 'cmo', 'growth', 'demand gen', 'brand', 'content', 'social', 'seo', 'advertis'] },
  { key: 'sales', label: 'Sales / Revenue', keywords: ['sales', 'revenue', 'account exec', ' ae ', 'sdr', 'bdr', 'cro', 'business development', 'quota'] },
  { key: 'ops', label: 'Operations', keywords: ['operations', ' ops', 'coo', 'logistics', 'supply', 'fulfil', 'process'] },
  { key: 'finance', label: 'Finance', keywords: ['finance', 'cfo', 'controller', 'accounting', 'procure', 'budget owner', 'treasur'] },
  { key: 'technical', label: 'Technical / Eng', keywords: ['engineer', 'developer', 'cto', 'technical', ' it ', 'devops', 'data eng', 'security', 'architect', 'admin'] },
  { key: 'product', label: 'Product / Design', keywords: ['product', ' pm ', 'design', ' ux', 'research'] },
  { key: 'people', label: 'HR / People', keywords: [' hr ', 'people ops', 'talent', 'recruit', 'l&d', 'benefits'] },
  { key: 'clinical', label: 'Clinical / Care', keywords: ['clinic', 'provider', 'physician', 'nurse', 'patient', 'care team', 'pharma', 'health'] },
  { key: 'investor', label: 'Investor', keywords: ['investor', ' vc ', ' lp ', 'angel', 'capital', 'family office', 'allocator', 'fund'] },
  { key: 'smb', label: 'SMB / Solo', keywords: ['small business', ' smb', 'solopreneur', 'freelanc', 'agency owner', 'local business'] },
  { key: 'consumer', label: 'Consumer / Member', keywords: ['consumer', 'individual', 'member', 'donor', 'subscriber', 'general public', 'student', 'parent', 'fan', 'shopper', 'audience'] },
]

/** Proof / RTB types — the "why believe it" behind a message, normalized from a proof-point label. */
export const PROOF_TYPES: ArchetypeEntry[] = [
  { key: 'social', label: 'Social proof', keywords: ['customer', 'user', 'testimonial', 'review', 'trusted by', 'loved by', 'community', 'join ', 'thousands', 'rated', 'star'] },
  { key: 'results', label: 'Results / Data', keywords: ['result', 'roi', 'increase', 'growth', '%', 'proven', 'measurable', 'outcome', 'metric', 'lift'] },
  { key: 'authority', label: 'Authority / Expertise', keywords: ['expert', 'award', 'certified', 'leader', '#1', 'best', 'recognized', 'backed by', 'featured', 'endorse'] },
  { key: 'speed', label: 'Speed / Efficiency', keywords: ['fast', 'instant', 'minute', 'save time', 'quick', 'automat', 'effortless', 'real-time', 'same day'] },
  { key: 'cost', label: 'Cost / Value', keywords: ['save money', 'cheaper', 'affordable', 'cost', 'free', 'no fee', 'value', 'cut spend', 'lower'] },
  { key: 'risk', label: 'Risk reduction', keywords: ['secure', 'safe', 'compliant', 'guarantee', 'reliable', 'no risk', 'hipaa', 'soc 2', 'protect', 'trusted'] },
  { key: 'ease', label: 'Ease / Simplicity', keywords: ['easy', 'simple', 'no code', 'no-code', 'seamless', 'one click', 'intuitive', 'setup in', 'plug'] },
  { key: 'transformation', label: 'Transformation', keywords: ['transform', 'unlock', 'achieve', 'become', 'scale', 'breakthrough', 'reinvent', 'future'] },
]

const matchArchetype = (entries: ArchetypeEntry[], raw: string | undefined | null, fallback: string): string => {
  const s = ` ${(raw ?? '').toLowerCase()} `
  for (const e of entries) {
    if (e.keywords.some((k) => s.includes(k))) return e.key
  }
  return fallback
}

/** Normalize a raw audience name → a persona archetype key (e.g. "founder"). */
export const archetypeFor = (audience: string | undefined | null): string => matchArchetype(PERSONA_ARCHETYPES, audience, 'other')

/** Normalize a raw proof-point label → a proof-type key (e.g. "social"). */
export const proofTypeFor = (label: string | undefined | null): string => matchArchetype(PROOF_TYPES, label, 'other')

const LABELS: Record<string, string> = {
  ...Object.fromEntries([...PERSONA_ARCHETYPES, ...PROOF_TYPES].map((e) => [e.key, e.label])),
  other: 'Other',
}
/** Human label for an archetype or proof-type key. */
export const archetypeLabel = (key: string): string => LABELS[key] ?? key
