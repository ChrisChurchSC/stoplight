import { useEffect } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import { BrandGoal } from './BrandGoal'
import { BrandInfo } from './BrandInfo'
import { BrandStrategy } from './BrandStrategy'
import { BrandVoice } from './BrandVoice'
import { BrandVisual } from './BrandVisual'

/**
 * Brand — a brand's foundation in one place, grouped under sub-tabs: About (the
 * profile), Voice, Visual, and Strategy. Reached from the workspace dropdown as
 * "Brand settings". Proof points / CTAs / hooks moved out to Records → Proof points
 * (a collection, not a settings tab).
 */
const BRAND_TABS = [
  ['about', 'About'],
  ['voice', 'Voice'],
  ['visual', 'Visual'],
  ['strategy', 'Strategy'],
] as const

export function BrandPage({ brand }: { brand?: string }) {
  // The sub-tab lives in the store so it survives navigating away and back.
  const storedTab = useTrafficStore((s) => s.brandTab)
  const setBrandTab = useTrafficStore((s) => s.setBrandTab)
  const setMessagingBrand = useTrafficStore((s) => s.setMessagingBrand)
  // Audiences moved to Records → Segments, and Goal folded into About; fall back to
  // About if either of those tabs is still persisted.
  const tab =
    storedTab === 'audiences' || storedTab === 'goal' || storedTab === 'channels' || storedTab === 'messaging'
      ? 'about'
      : storedTab

  // The Strategy tab reads the brand's messaging system — point it at this brand.
  useEffect(() => {
    if (tab === 'strategy' && brand) setMessagingBrand(brand)
  }, [tab, brand, setMessagingBrand])

  if (!brand) {
    return (
      <div className="mtx">
        <div className="mtx-empty">Pick a brand in the sidebar to see its brand system.</div>
      </div>
    )
  }

  return (
    <div className="brand-page">
      <div className="home-main-head brand-page-head">
        <h1 className="home-main-title">Brand settings</h1>
        <div className="folder-tabs brand-subtabs" role="tablist" aria-label="Brand settings sections">
          {BRAND_TABS.map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`folder-tab${tab === t ? ' active' : ''}`}
              onClick={() => setBrandTab(t)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'about' ? (
        <>
          <BrandInfo brand={brand} />
          <BrandGoal key={`brand-goal-${brand}`} brand={brand} />
        </>
      ) : tab === 'voice' ? (
        <BrandVoice brand={brand} />
      ) : tab === 'visual' ? (
        <BrandVisual brand={brand} />
      ) : (
        <BrandStrategy key="brand-strategy" brand={brand} />
      )}
    </div>
  )
}
