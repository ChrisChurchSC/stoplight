import { useEffect, useState } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import { AudienceSheet } from './AudienceSheet'
import { BrandGoal } from './BrandGoal'
import { BrandInfo } from './BrandInfo'
import { BrandStrategy } from './BrandStrategy'
import { BrandVoice } from './BrandVoice'
import { LibraryPage } from './LibraryPage'

/**
 * Brand — a brand's foundation in one place, grouped under sub-tabs: About (the
 * profile), Voice (how it sounds), and Messaging (its messaging library). A
 * top-level, brand-scoped destination in the sidebar. The Messaging tab drives
 * LibraryPage, so opening it points the messaging library at this brand.
 */
export function BrandPage({ brand }: { brand?: string }) {
  const [tab, setTab] = useState<'about' | 'goal' | 'voice' | 'audiences' | 'strategy' | 'messaging'>('about')
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
      <div className="home-main-head">
        <h1 className="home-main-title">{brand} · Brand</h1>
        <div className="folder-tabs">
          <button className={`folder-tab${tab === 'about' ? ' active' : ''}`} onClick={() => setTab('about')}>
            About
          </button>
          <button
            className={`folder-tab${tab === 'goal' ? ' active' : ''}`}
            onClick={() => setTab('goal')}
            title="The business goal every campaign ladders up to, and its north-star metric"
          >
            Goal
          </button>
          <button
            className={`folder-tab${tab === 'voice' ? ' active' : ''}`}
            onClick={() => setTab('voice')}
            title="How the brand sounds — the tone canvases are generated in"
          >
            Voice
          </button>
          <button
            className={`folder-tab${tab === 'audiences' ? ' active' : ''}`}
            onClick={() => setTab('audiences')}
            title="The brand's audiences — who its canvases target"
          >
            Audiences
          </button>
          <button
            className={`folder-tab${tab === 'strategy' ? ' active' : ''}`}
            onClick={() => setTab('strategy')}
            title="The brand's GTM strategies"
          >
            Strategy
          </button>
          <button
            className={`folder-tab${tab === 'messaging' ? ' active' : ''}`}
            onClick={() => setTab('messaging')}
            title="Proof points, CTAs, subjects, and hooks"
          >
            Messaging
          </button>
        </div>
      </div>
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
      ) : (
        <LibraryPage key="brand-messaging" inline kinds={['rtbs', 'ctas', 'hooks']} />
      )}
    </div>
  )
}
