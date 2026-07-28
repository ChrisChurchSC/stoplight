import { useState } from 'react'
import { GTM_STRATEGIES, resolveStrategyKey } from '../domain/strategies'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Brand strategy — pick one GTM playbook at the brand level and apply it to every
 * campaign at once, instead of setting it campaign by campaign in each frame bar. The
 * current state reads back from the campaigns: one shared playbook shows as selected,
 * a spread shows as "Mixed". Applying ripples the playbook across the brand's draft
 * assets (posted/linked-external assets are welded and left alone). The choices are the
 * canonical GTM playbooks, the ones actually wired into stage sequencing and drafting;
 * there is deliberately no "author a custom strategy" path (it drove nothing).
 */

/** A campaign's stored strategy string resolved to a canonical GTM name, or null. */
function gtmNameOf(stored: string | undefined): string | null {
  const key = resolveStrategyKey((stored ?? '').trim())
  return key ? (GTM_STRATEGIES.find((g) => g.key === key)?.name ?? null) : null
}

export function BrandStrategy({ brand }: { brand: string }) {
  const { canvases } = useHomeCanvases()
  const campaignList = useTrafficStore((s) => s.campaignList)
  const setBrandStrategy = useTrafficStore((s) => s.setBrandStrategy)
  const [justApplied, setJustApplied] = useState<string | null>(null)

  const brandCampaigns = canvases.filter((c) => c.client === brand)
  const n = brandCampaigns.length
  const stratOf = (name: string) => campaignList.find((c) => c.name === name)?.strategy
  const names = new Set(brandCampaigns.map((c) => gtmNameOf(stratOf(c.name))))
  const currentName = names.size === 1 ? [...names][0] : null
  const stateLabel = currentName ?? (names.size > 1 ? 'Mixed' : 'Not set')

  const apply = (name: string) => {
    setBrandStrategy(brand, name)
    setJustApplied(name)
  }

  return (
    <div className="brand-strat">
      <div className="brand-strat-head">
        <div className="brand-strat-copy">
          <strong>Campaign strategy</strong>
          <span>
            The GTM playbook every campaign follows. Pick one to apply it across all {n} campaign
            {n === 1 ? '' : 's'} at once.
          </span>
        </div>
        <span className={`brand-strat-state${currentName ? ' set' : ''}`}>{stateLabel}</span>
      </div>

      <div className="brand-strat-grid">
        {GTM_STRATEGIES.map((s) => {
          const active = currentName === s.name
          return (
            <button
              key={s.key}
              className={`brand-strat-opt${active ? ' on' : ''}`}
              onClick={() => apply(s.name)}
              title={`Apply ${s.name} to all ${n} campaigns`}
            >
              <span className="brand-strat-opt-top">
                <span className="brand-strat-name">{s.name}</span>
                {active ? <span className="brand-strat-mark on">✓ applied</span> : <span className="brand-strat-mark">Apply to all</span>}
              </span>
              <span className="brand-strat-seq">{s.sequence}</span>
              <span className="brand-strat-best">{s.bestFor}</span>
            </button>
          )
        })}
      </div>

      {justApplied && (
        <div className="brand-strat-note">
          ✓ {justApplied} applied to all {n} campaign{n === 1 ? '' : 's'}. Draft copy is re-drafting to match; published assets are untouched.
        </div>
      )}
    </div>
  )
}
