/**
 * THE FIRST-RUN TOUR: what Breadcrumbs is, in five cards, before anybody has to guess.
 *
 * Separate from onboarding.ts on purpose. That file is a CHECKLIST ("Set up your brand" with a tick
 * next to it), it tracks completion against real workspace state, and it is meant to sit around for
 * days. This is a TOUR: a short sequence you read once and dismiss. Different shape, different
 * lifetime, different state, so mixing them would give both the wrong behaviour.
 *
 * WHAT THE COPY IS FOR. Each card teaches ONE thing, and they are ordered so that following them in
 * order lands you on written copy rather than on an empty campaign. The wiring card exists because
 * the app refuses to write copy from an unwired board, which is a deliberate rule and the single
 * most surprising thing about the product if nobody tells you first.
 *
 * ANCHORS ARE A HINT, NEVER A REQUIREMENT. A step may name a CSS selector to point at. If the
 * element is not on screen, the card centres itself instead of pointing at nothing, so a tour step
 * can never break because a surface it referenced moved or was renamed.
 */

export interface TourStep {
  /** Stable id, used for the persisted "where did I get to" and nothing else. */
  id: string
  /** The dark title bar. Keep it short: it is a label, not a sentence. */
  title: string
  /** One or two short paragraphs. Two is the maximum that still gets read. */
  body: string[]
  /**
   * Optional element to point at. Degrades to a centred card when it does not resolve, so a
   * selector going stale is a cosmetic loss rather than a broken step.
   */
  anchor?: string
  /** Overrides the "Next" label on the last card, so the tour ends on an action. */
  cta?: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Breadcrumbs',
    body: [
      'Breadcrumbs plans a campaign and writes the copy for it, with a record of what every line was based on.',
      'Five short cards and you will know the whole loop. You can close this at any point.',
    ],
  },
  {
    id: 'brand',
    title: 'Start with a brand',
    body: [
      'Everything hangs off a brand: its voice, its audiences, and the proof it is allowed to claim.',
      'Campaigns belong to one, and the writing reads from it. So this is the first thing to make.',
    ],
    anchor: '.tour-anchor-brand',
  },
  {
    id: 'gretel',
    title: 'Describe the campaign',
    body: [
      'Open a campaign and tell Gretel what you are launching, in the words you would use with a colleague.',
      'She picks a motion, proposes the posts and emails, and shows you the plan before anything is created.',
    ],
  },
  {
    id: 'wiring',
    title: 'Connect what it writes from',
    body: [
      'The canvas is not a diagram. A card only reaches the copy when you draw a line from it, so what you connect is exactly what the writing is allowed to use.',
      'That is why a campaign with nothing wired up will refuse to write rather than invent something.',
    ],
  },
  {
    id: 'generate',
    title: 'Generate, then check the work',
    body: [
      'Generate writes every asset at once, and each one keeps the audience, proof and figures it came from.',
      'Anything it could not stand behind is flagged rather than quietly smoothed over.',
    ],
    cta: 'Start with a brand',
  },
]

/** Persisted so the tour appears once, and picks up where you left it if you close it midway. */
export interface TourState {
  /** Index of the card to show next. */
  step: number
  /** True once finished or dismissed. Nothing shows the tour again unless it is reset. */
  done: boolean
}

export const DEFAULT_TOUR: TourState = { step: 0, done: false }
