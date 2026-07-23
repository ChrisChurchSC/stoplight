/**
 * Per-user interface preferences: two orthogonal axes that tailor Breadcrumbs without hiding
 * anything. `skillLevel` decides HOW MUCH surface shows (progressive disclosure); `marketerRole`
 * decides WHICH objects, metrics, and vocabulary lead. Both only set defaults and ordering — null =
 * today's full UI, and a wrong pick is never worse than the status quo. Persisted (localStorage +
 * the Supabase workspace_state mirror) so it survives a device change. See the design plan.
 */
export type SkillLevel = 'simple' | 'advanced'
export type MarketerRole = 'email' | 'brand' | 'product' | 'growth'

export interface UserPrefs {
  /** null = neutral (today's Advanced UI). */
  skillLevel: SkillLevel | null
  /** null = neutral (no role emphasis, full UI). */
  marketerRole: MarketerRole | null
  /** Whether creating a campaign opens the template picker or a blank canvas. */
  defaultStart: 'templates' | 'blank'
  /** Set once the PASSIVE role nudge (an existing workspace we can infer a focus for) is answered
   *  or waved off, so it never nags again. */
  focusDismissed: boolean
}

export const DEFAULT_USER_PREFS: UserPrefs = {
  skillLevel: null,
  marketerRole: null,
  defaultStart: 'templates',
  focusDismissed: false,
}

export const SKILL_LEVELS: { value: SkillLevel; label: string; hint: string }[] = [
  { value: 'simple', label: 'Simple', hint: 'Fewer fields and a calmer surface. Everything is one click away.' },
  { value: 'advanced', label: 'Advanced', hint: 'Every column, metric, and control. The full experience.' },
]

export const MARKETER_ROLES: { value: MarketerRole; label: string; hint: string }[] = [
  { value: 'email', label: 'Email / lifecycle', hint: 'Channels, triggers, and messaging lead; email templates.' },
  { value: 'brand', label: 'Brand / content', hint: 'Voice, proof, and messaging lead; organic channels.' },
  { value: 'product', label: 'Product', hint: 'Audiences and objectives lead; activation and lifecycle.' },
  { value: 'growth', label: 'Growth / performance', hint: 'The full data view: budget, attribution, benchmarks.' },
]
