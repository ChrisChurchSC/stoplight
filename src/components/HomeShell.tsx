import type { ReactNode } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import { CanvasProjectTabs } from './CanvasProjectTabs'
import { HomeSidebar } from './HomeSidebar'
import { BrandRail } from './BrandRail'

/**
 * The campaign-scoped left rail, shown while a campaign is open in place of the app destinations
 * nav. Files (the flow canvas), Assets (the grid of asset cards), and Crumbot (the assistant) —
 * driven off the store so the same Figma-style icon rail can switch views and toggle the panel.
 */
function CampaignRail() {
  const flowView = useTrafficStore((s) => s.flowView)
  const setFlowView = useTrafficStore((s) => s.setFlowView)
  const chatCollapsed = useTrafficStore((s) => s.flowChatCollapsed)
  const setChatCollapsed = useTrafficStore((s) => s.setFlowChatCollapsed)
  return (
    <aside className="sidebar home-sidebar hsb">
      <nav className="sidebar-nav">
        <button
          className={`nav-item${flowView === 'flow' ? ' active' : ''}`}
          onClick={() => setFlowView('flow')}
          title="Files: the campaign canvas"
        >
          <span className="nav-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" />
            </svg>
          </span>
          <span className="nav-label">Files</span>
        </button>
        <button
          className={`nav-item${flowView === 'grid' ? ' active' : ''}`}
          onClick={() => setFlowView('grid')}
          title="Assets: the grid of every asset"
        >
          <span className="nav-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
              <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
            </svg>
          </span>
          <span className="nav-label">Assets</span>
        </button>
        <button
          className={`nav-item${flowView === 'flow' && !chatCollapsed ? ' active' : ''}`}
          // Crumbot only lives on the flow canvas, so bring the view back to Files when opening it
          // from Assets; when already on the canvas, just toggle it.
          onClick={() => {
            const wasFlow = flowView === 'flow'
            setFlowView('flow')
            setChatCollapsed(wasFlow ? !chatCollapsed : false)
          }}
          title="Crumbot: the campaign assistant"
        >
          <span className="nav-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
            </svg>
          </span>
          <span className="nav-label">Crumbot</span>
        </button>
      </nav>
    </aside>
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
  // Inside a campaign (the flow canvas is open) the app destinations nav gives way to a campaign
  // rail: Files / Assets / Crumbot. Outside, it's the usual destinations nav.
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
      <BrandRail />
      {flowCanvasOpen ? <CampaignRail /> : <HomeSidebar mode="destinations" />}
      <div className="home-main">
        <CanvasProjectTabs />
        {children}
      </div>
    </div>
  )
}
