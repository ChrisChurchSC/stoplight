import type { ReactNode } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import { CanvasProjectTabs } from './CanvasProjectTabs'
import { HomeSidebar } from './HomeSidebar'
import { BrandRail } from './BrandRail'

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
      <HomeSidebar mode="destinations" />
      <div className="home-main">
        <CanvasProjectTabs />
        {children}
      </div>
    </div>
  )
}
