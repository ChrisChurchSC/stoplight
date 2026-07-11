import type { ReactNode } from 'react'
import { CanvasProjectTabs } from './CanvasProjectTabs'
import { HomeSidebar } from './HomeSidebar'

/**
 * The shared dashboard shell — files sidebar on the left, the open-canvas tab bar
 * across the top, content in the main column. Used by the home gallery AND the
 * Library / Connectors / Billing pages, so they all share one layout (matching the
 * canvas, which uses the same sidebar + tab bar). Children fill the main column and
 * own their own scroll/padding.
 */
export function HomeShell({ children }: { children: ReactNode }) {
  return (
    <div className="home-shell">
      <HomeSidebar />
      <div className="home-main">
        <CanvasProjectTabs />
        {children}
      </div>
    </div>
  )
}
