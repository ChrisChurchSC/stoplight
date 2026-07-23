import { useState, type ReactNode } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import { CanvasProjectTabs } from './CanvasProjectTabs'
import { HomeSidebar } from './HomeSidebar'
import { BrandRail } from './BrandRail'

const FilesIco = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" />
  </svg>
)
const AssetsIco = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
  </svg>
)
const SparkIco = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
  </svg>
)

/**
 * The campaign-scoped nav — Files (the flow canvas), Assets (the grid of asset cards), and Crumbot
 * (the assistant). Rendered inside the BrandRail so a campaign gets ONE combined left rail: brand
 * switcher on top, these in the middle, account at the foot. Driven off the store so the same rail
 * can switch views and toggle the panel.
 */
function CampaignNav() {
  const flowView = useTrafficStore((s) => s.flowView)
  const setFlowView = useTrafficStore((s) => s.setFlowView)
  const chatCollapsed = useTrafficStore((s) => s.flowChatCollapsed)
  const setChatCollapsed = useTrafficStore((s) => s.setFlowChatCollapsed)
  const [hover, setHover] = useState<string | null>(null)
  const btn = (key: string, active: boolean, onClick: () => void, title: string, icon: ReactNode, label: string) => (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(key)}
      onMouseLeave={() => setHover((h) => (h === key ? null : h))}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: '100%',
        padding: '9px 4px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 10.5, lineHeight: 1.2, fontWeight: active ? 650 : 550,
        background: active ? 'var(--accent-soft)' : hover === key ? 'var(--surface-2)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
      }}
    >
      <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      {label}
    </button>
  )
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
      {btn('files', flowView === 'flow', () => setFlowView('flow'), 'Files: the campaign canvas', <FilesIco />, 'Files')}
      {btn('assets', flowView === 'grid', () => setFlowView('grid'), 'Assets: the grid of every asset', <AssetsIco />, 'Assets')}
      {btn(
        'crumbot',
        flowView === 'flow' && !chatCollapsed,
        () => {
          // Crumbot only lives on the flow canvas: bring the view back when opening it from Assets.
          const wasFlow = flowView === 'flow'
          setFlowView('flow')
          setChatCollapsed(wasFlow ? !chatCollapsed : false)
        },
        'Crumbot: the campaign assistant',
        <SparkIco />,
        'Crumbot',
      )}
    </div>
  )
}

/**
 * The shared dashboard shell — files sidebar on the left, the open-canvas tab bar
 * across the top, content in the main column. Used by the home gallery AND the
 * Library / Connectors / Billing pages, so they all share one layout (matching the
 * canvas, which uses the same sidebar + tab bar). Children fill the main column and
 * own their own scroll/padding.
 *
 * A single-flow share renders chromeless (no rail, sidebar, or tab bar) so the recipient is
 * confined to the one flow they were given — nothing to navigate away with.
 */
export function HomeShell({ children }: { children: ReactNode }) {
  const flowOnly = useTrafficStore((s) => !!s.sharedSession?.campaign)
  // Inside a campaign the destinations nav folds into the BrandRail as one combined rail (brand
  // switcher · Files / Assets / Crumbot · account); outside, the usual destinations nav sits beside it.
  const flowCanvasOpen = useTrafficStore((s) => s.flowCanvasOpen)
  if (flowOnly) {
    return (
      <div className="home-shell home-shell-flowonly">
        <div className="home-main">{children}</div>
      </div>
    )
  }
  return (
    <div className="home-shell">
      {flowCanvasOpen ? (
        <BrandRail>
          <CampaignNav />
        </BrandRail>
      ) : (
        <>
          <BrandRail />
          <HomeSidebar mode="destinations" />
        </>
      )}
      <div className="home-main">
        <CanvasProjectTabs />
        {children}
      </div>
    </div>
  )
}
