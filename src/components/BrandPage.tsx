import { useEffect, useState } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import { BrandInfo } from './BrandInfo'
import { BrandVoice } from './BrandVoice'
import { LibraryPage } from './LibraryPage'

/**
 * Brand — a brand's foundation in one place, grouped under sub-tabs: About (the
 * profile), Voice (how it sounds), and Messaging (its messaging library). A
 * top-level, brand-scoped destination in the sidebar. The Messaging tab drives
 * LibraryPage, so opening it points the messaging library at this brand.
 */
export function BrandPage({ brand }: { brand?: string }) {
  const [tab, setTab] = useState<'about' | 'voice' | 'messaging'>('about')
  const setMessagingBrand = useTrafficStore((s) => s.setMessagingBrand)

  useEffect(() => {
    if (tab === 'messaging' && brand) setMessagingBrand(brand)
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
            className={`folder-tab${tab === 'voice' ? ' active' : ''}`}
            onClick={() => setTab('voice')}
            title="How the brand sounds — the tone canvases are generated in"
          >
            Voice
          </button>
          <button className={`folder-tab${tab === 'messaging' ? ' active' : ''}`} onClick={() => setTab('messaging')}>
            Messaging
          </button>
        </div>
      </div>
      {tab === 'about' ? <BrandInfo brand={brand} /> : tab === 'voice' ? <BrandVoice brand={brand} /> : <LibraryPage inline />}
    </div>
  )
}
