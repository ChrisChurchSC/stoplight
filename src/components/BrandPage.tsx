import { useEffect } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import { AudienceSheet } from './AudienceSheet'
import { BrandGoal } from './BrandGoal'
import { BrandInfo } from './BrandInfo'
import { BrandStrategy } from './BrandStrategy'
import { BrandVoice } from './BrandVoice'
import { ChannelsView } from './ChannelsView'
import { LandscapeView } from './LandscapeView'
import { LibraryPage } from './LibraryPage'

/**
 * Brand — a brand's foundation in one place, grouped under sub-tabs: About (the
 * profile), Voice (how it sounds), and Messaging (its messaging library). A
 * top-level, brand-scoped destination in the sidebar. The Messaging tab drives
 * LibraryPage, so opening it points the messaging library at this brand.
 */
export function BrandPage({ brand }: { brand?: string }) {
  // The sub-tab lives in the store so the sidebar's nested Brand items drive it.
  const tab = useTrafficStore((s) => s.brandTab)
  const setMessagingBrand = useTrafficStore((s) => s.setMessagingBrand)

  // Any library-backed tab needs the messaging system pointed at this brand.
  useEffect(() => {
    if ((tab === 'audiences' || tab === 'strategy' || tab === 'messaging') && brand) setMessagingBrand(brand)
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
      {tab !== 'channels' && (
        <div className="home-main-head">
          <h1 className="home-main-title">{brand} · Brand</h1>
        </div>
      )}
      {tab === 'about' ? (
        <BrandInfo brand={brand} />
      ) : tab === 'goal' ? (
        <BrandGoal key={`brand-goal-${brand}`} brand={brand} />
      ) : tab === 'voice' ? (
        <BrandVoice brand={brand} />
      ) : tab === 'audiences' ? (
        <AudienceSheet key={`aud-sheet-${brand}`} brand={brand} />
      ) : tab === 'strategy' ? (
        <BrandStrategy key="brand-strategy" brand={brand} />
      ) : tab === 'channels' ? (
        <ChannelsView key={`brand-channels-${brand}`} scopeClient={brand} />
      ) : tab === 'landscape' ? (
        <LandscapeView key={`brand-landscape-${brand}`} brand={brand} />
      ) : (
        <LibraryPage key="brand-messaging" inline kinds={['rtbs', 'ctas', 'hooks']} />
      )}
    </div>
  )
}
