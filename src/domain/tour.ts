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
   *
   * These are structural class names, not decorative ones, which is why it is safe to target them:
   * .fchat is the assistant panel, .flow-tb-palette the canvas toolbar, .flow-tb-regen the Generate
   * button. If one is ever renamed the step centres instead of breaking.
   */
  anchor?: string
  /**
   * Shown while the anchor has not appeared yet, because the step describes something that only
   * exists on another screen. Without it a card would sit in the middle talking about a Generate
   * button nobody can see, which is the failure this whole change is meant to remove.
   */
  waitingFor?: string
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
      'Tell Gretel what you are launching, in the words you would use with a colleague.',
      'She picks a motion, proposes the posts and emails, and shows you the plan before anything is created.',
    ],
    anchor: '.fchat',
    waitingFor: 'Open a campaign and this card will point at the assistant.',
  },
  {
    id: 'wiring',
    title: 'Connect what it writes from',
    body: [
      'Add cards from here, then draw a line from each one to what it should inform.',
      'The canvas is not a diagram: a card only reaches the copy once it is connected, which is why a campaign with nothing wired up refuses to write rather than inventing something.',
    ],
    anchor: '.flow-tb-palette',
    waitingFor: 'Open a campaign and this card will point at the toolbar.',
  },
  {
    id: 'generate',
    title: 'Generate, then check the work',
    body: [
      'Generate writes every asset at once, and each one keeps the audience, proof and figures it came from.',
      'Anything it could not stand behind is flagged rather than quietly smoothed over.',
    ],
    anchor: '.flow-tb-regen',
    waitingFor: 'Build the campaign and this card will point at Generate.',
    cta: 'Got it',
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
