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
