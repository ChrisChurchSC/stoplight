import { type AskBrand, EMPTY_ASK_BRAND } from '../domain/askClaude'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Gather the scoped brand's foundation (positioning, audiences, messages, voices, proof points) so
 * the Ask chat can answer brand-specific and strategy questions, not just campaign performance.
 * Reads the live store; returns an empty brand when nothing is scoped.
 */
export function buildAskBrand(brandName: string): AskBrand {
  const brand = brandName && brandName !== 'all' ? brandName : ''
  if (!brand) return EMPTY_ASK_BRAND
  const s = useTrafficStore.getState()
  const rec = (s.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
  const profile = (s.clientProfiles[brand] ?? {}) as Record<string, string>
  const audiences = (s.clientAudiences[brand] ?? []).map((a) => a.name).filter(Boolean)
  const proofPoints = (s.brandSystems[brand]?.rtbs ?? []).map((r) => r.label).filter(Boolean).slice(0, 12)
  const messages = s.messages.filter((m) => !m.brand || m.brand === brand).map((m) => m.name).filter(Boolean).slice(0, 12)
  const voices = s.voices.filter((v) => !v.brand || v.brand === brand).map((v) => v.name).filter(Boolean).slice(0, 12)
  return {
    name: brand,
    oneLiner: profile.oneLiner ?? '',
    positioning: rec.positioning ?? '',
    industry: rec.industry ?? profile.industry ?? '',
    audiences,
    proofPoints,
    messages,
    voices,
  }
}
