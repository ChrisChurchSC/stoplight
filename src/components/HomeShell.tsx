import type { ReactNode } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import { CanvasProjectTabs } from './CanvasProjectTabs'
import { HomeSidebar } from './HomeSidebar'
import { BrandRail } from './BrandRail'

const FilesIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" />
  </svg>
)
const AssetsIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
  </svg>
)
const SparkIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
  </svg>
)
const BackIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

/**
 * The campaign-scoped nav — Files (the flow canvas), Assets (the grid of asset cards), and Gretel
 * (the assistant). Rendered inside the BrandRail so a campaign gets ONE combined left rail; shares
 * the .railnav styling with the destinations nav so both look identical. Driven off the store.
 */
function CampaignNav() {
  const flowView = useTrafficStore((s) => s.flowView)
  const setFlowView = useTrafficStore((s) => s.setFlowView)
  const gretelOpen = useTrafficStore((s) => s.gretelOpen)
  const setGretelOpen = useTrafficStore((s) => s.setGretelOpen)
  const assetsOpen = useTrafficStore((s) => s.flowAssetsOpen)
  const setAssetsOpen = useTrafficStore((s) => s.setFlowAssetsOpen)
  // FlowsView owns which screen it is on, so leaving the canvas is a request rather than a state
  // this component can set directly.
  const goHome = useTrafficStore((s) => s.goFlowHome)
  // Files and Assets act on the ONE canvas: Files is the board itself, Assets is a panel docked
  // onto its left. Neither swaps the canvas out, so switching between them never feels like a
  // different screen. Gretel is no longer one of them — it opens a dialog over the board rather
  // than taking the left slot, so it leaves whatever you were in untouched behind it.
  const onBoard = flowView === 'flow'
  /**
   * ICONS ONLY inside a campaign. These three never change and never grow, and the labels repeated
   * what the icon already says on the one screen you spend the most time on. The name is not lost:
   * `title` still shows it on hover and `aria-label` is what a screen reader announces, which is why
   * the label span can go rather than being hidden with CSS.
   */
  return (
    <div className="railnav railnav--icons">
      {/* OUT OF THE CAMPAIGN. While one is open this rail replaces the app's destinations, so
          without this the only way back was the breadcrumb at the top of the canvas. Sits above a
          rule because it leaves this campaign rather than switching a panel inside it. */}
      <button
        className="nav-item railnav-back"
        onClick={() => goHome()}
        title="Back to all campaigns"
        aria-label="Back to all campaigns"
      >
        <span className="nav-ico"><BackIco /></span>
      </button>
      <div className="railnav-sep" />
      <button
        className={`nav-item${onBoard && !assetsOpen ? ' active' : ''}`}
        onClick={() => { setFlowView('flow'); setAssetsOpen(false) }}
        title="Files: the campaign board"
        aria-label="Files"
      >
        <span className="nav-ico"><FilesIco /></span>
      </button>
      {/* ASSETS IS STILL PARKED. It works, but the canvas is what is being made good, and a rail
          offering a door to somewhere unfinished invites people through it. Disabled with the
          reason on the tooltip rather than hidden, because a control that vanishes reads as
          something you broke, and it is coming back. Re-enable by deleting the disabled prop and
          giving it the onClick the other two have. */}
      <button
        className="nav-item soon"
        disabled
        title="Assets: the brand's asset libraries. Coming soon."
        aria-label="Assets, coming soon"
      >
        <span className="nav-ico"><AssetsIco /></span>
      </button>
      {/* Gretel hands off rather than answering here: it opens a dialog with a question about what
          is on screen and a door to Claude or ChatGPT, where the Breadcrumbs connector gives them
          this workspace. So unlike Files and Assets it changes nothing about the canvas — no panel
          to close, nothing to give the slot back to. */}
      <button
        className={`nav-item${gretelOpen ? ' active' : ''}`}
        onClick={() => { setFlowView('flow'); setGretelOpen(true) }}
        title="Gretel: ask your data anything"
        aria-label="Gretel"
      >
        <span className="nav-ico"><SparkIco /></span>
      </button>
    </div>
  )
}

/**
 * The shared dashboard shell — a single combined left rail, the open-canvas tab bar across the top,
 * and content in the main column. The rail always folds into the BrandRail: brand switcher and "+"
 * on top, the middle nav (Files / Assets / Gretel inside a campaign, else the app destinations),
 * and account at the foot. Children fill the main column and own their own scroll/padding.
 *
 * A single-flow share renders chromeless (no rail or tab bar) so the recipient is confined to the
 * one flow they were given — nothing to navigate away with.
 */
export function HomeShell({ children }: { children: ReactNode }) {
  const flowOnly = useTrafficStore((s) => !!s.sharedSession?.campaign)
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
      <BrandRail iconsOnly={flowCanvasOpen}>{flowCanvasOpen ? <CampaignNav /> : <HomeSidebar mode="railitems" />}</BrandRail>
      <div className="home-main">
        <CanvasProjectTabs />
        {children}
      </div>
    </div>
  )
}
