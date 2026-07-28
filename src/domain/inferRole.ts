import type { MarketerRole } from './userPrefs'

/**
 * Passively infer a likely marketer role from a workspace's strongest stored signal: its GTM
 * strategy. Returns null when there is no strong signal, so the nudge stays SILENT rather than
 * guess. A manual pick always wins over this (see the focus chooser + Account Settings).
 */
const STRATEGY_ROLE: Record<string, { role: MarketerRole; label: string }> = {
  lifecycle: { role: 'email', label: 'lifecycle marketing' },
  'content-seo': { role: 'brand', label: 'content and SEO' },
  plg: { role: 'product', label: 'product-led growth' },
  'demand-gen': { role: 'growth', label: 'demand generation' },
}

export interface RoleSuggestion {
  role: MarketerRole
  /** The signal to cite, so the nudge is transparent about why. */
  reason: string
}

export function inferRole(strategy: string | null | undefined): RoleSuggestion | null {
  const strat = strategy?.trim()
  const hit = strat ? STRATEGY_ROLE[strat] : undefined
  return hit ? { role: hit.role, reason: `your GTM motion is ${hit.label}` } : null
}
