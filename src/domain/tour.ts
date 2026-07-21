/**
 * The one-time guided coach-mark tour: a few Home anchors, each with a title + body. Steps whose
 * anchor element isn't currently on screen are skipped, so the tour never points at nothing.
 * Persisted "done" flag lives in localStorage; the tour fires once after first-run.
 */
export interface TourStep {
  /** CSS selector for the element to highlight (first match wins). */
  sel: string
  title: string
  body: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    sel: '.ag2-ask',
    title: 'Ask anything',
    body: 'Describe what you want in plain language. It is the fastest way to draft a campaign, build your brand from your content, or ask what needs attention.',
  },
  {
    sel: '.ag2-startcard.primary, .ag2-chip-primary',
    title: 'Get started',
    body: 'New here? This walks you through setting up your brand and first campaign, step by step.',
  },
  {
    sel: '[aria-label="Add a brand"]',
    title: 'Your brands',
    body: 'Each brand is its own workspace: audiences, content library, campaigns, and insights. Add one here, then switch between them.',
  },
]

export const TOUR_KEY = 'stoplight.tourDone.v1'
