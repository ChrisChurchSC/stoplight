/**
 * The "Getting started" checklist — a first-run guide that teaches the core loop of the app
 * (set up a brand → define the records campaigns pull from → build a flow → write + review the
 * copy). Steps auto-complete from real workspace state where we can detect it, and can also be
 * checked off by hand. The widget lives globally (see GettingStarted.tsx) and its UI state
 * (collapsed / dismissed / hand-checked steps) persists under stoplight.onboarding.v1.
 */
export type OnboardingStepId =
  | 'brand'
  | 'segments'
  | 'proof'
  | 'flow'
  | 'connect'
  | 'review'

export interface OnboardingStep {
  id: OnboardingStepId
  /** The checklist line. */
  title: string
  /** One-line teach, shown under the title while the step is the current (first unfinished) one. */
  hint: string
}

// Order matters: the first not-yet-complete step is highlighted as "what to do next".
export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 'brand', title: 'Set up your brand', hint: 'Add your voice and one-liner so every draft sounds like you.' },
  { id: 'connect', title: 'Connect Claude', hint: 'Connect Claude so drafts are written by AI, not the offline fallback.' },
  { id: 'segments', title: 'Define your audiences', hint: 'Add the segments your campaigns speak to.' },
  { id: 'proof', title: 'Add proof points', hint: 'The reasons-to-believe every asset leans on.' },
  { id: 'flow', title: 'Create your first flow', hint: 'Start a campaign on the canvas.' },
  { id: 'review', title: 'Review your calendar', hint: 'See the campaign as a schedule, then ship it.' },
]

/** Persisted UI state for the checklist. */
export interface OnboardingState {
  /** Collapsed to the compact pill. */
  collapsed: boolean
  /** Dismissed entirely (hidden until reset). */
  dismissed: boolean
  /** Step ids the user checked off by hand (an override on top of auto-detection). */
  done: OnboardingStepId[]
}

export const DEFAULT_ONBOARDING: OnboardingState = { collapsed: false, dismissed: false, done: [] }
