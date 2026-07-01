import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The brand-layer tabs (Level 1), rendered into the top bar. The Campaigns tab
 * stays lit for both its sub-views (the lifecycle dashboard and Live). Content
 * switching lives in BrandWorkspace, which reads the same brandView from the
 * store — so the tabs can sit up in the top bar, decoupled from the body.
 */
const TABS = [
  { key: 'foundation', label: 'Foundation', hint: 'Who you talk to & how' },
  { key: 'personalize', label: 'Personalize', hint: 'Audience × stage × channel' },
  { key: 'campaigns', label: 'Campaigns', hint: 'Lifecycle + what’s live' },
] as const

export function BrandTabs() {
  const brandView = useTrafficStore((s) => s.brandView)
  const setBrandView = useTrafficStore((s) => s.setBrandView)
  const onCampaigns = brandView === 'campaigns' || brandView === 'live'

  return (
    <div className="brandtabs" role="tablist" aria-label="Brand layers">
      {TABS.map((t) => {
        const active = t.key === 'campaigns' ? onCampaigns : brandView === t.key
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            className={`brandtab${active ? ' active' : ''}`}
            onClick={() => setBrandView(t.key)}
            title={t.hint}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
