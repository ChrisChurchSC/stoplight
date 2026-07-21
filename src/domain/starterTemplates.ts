import type { MarketerRole } from './userPrefs'

/**
 * Goal-based quick-start templates: a beginner picks one and ships a role-appropriate campaign in a
 * click, instead of authoring a blank canvas or the 4-answer chat. Each points at an existing GTM
 * strategy and drives the proven home-chat build path with a tailored seed prompt (so it reuses the
 * campaign-builder machinery, authors no new copy, and honors the brand). "Start from scratch" is
 * handled by the picker itself (the existing new-campaign flow).
 */
export interface StarterTemplate {
  key: string
  label: string
  sub: string
  /** The marketer role this template suits (used to order/pre-select by the user's Focus). */
  role: MarketerRole
  /** A GTM_STRATEGIES key — the motion this campaign runs. */
  strategyKey: string
  /** The prompt handed to the home chat to build the campaign. */
  seed: string
  /** Emoji marker for the card. */
  icon: string
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: 'product-launch',
    label: 'Launch a product',
    sub: 'Announce a new product or feature and drive activation.',
    role: 'product',
    strategyKey: 'plg',
    icon: '🚀',
    seed: 'Draft a product launch campaign for this brand: awareness, activation, and adoption content across the funnel.',
  },
  {
    key: 'email-nurture',
    label: 'Nurture with email',
    sub: 'A lifecycle sequence to onboard, nurture, and retain.',
    role: 'email',
    strategyKey: 'lifecycle',
    icon: '✉️',
    seed: 'Draft an email nurture and lifecycle campaign for this brand: a welcome series, onboarding, and retention emails.',
  },
  {
    key: 'grow-signups',
    label: 'Grow signups',
    sub: 'A demand-gen push to drive leads and conversions.',
    role: 'growth',
    strategyKey: 'demand-gen',
    icon: '📈',
    seed: 'Draft a growth campaign for this brand to drive signups: paid acquisition, a lead magnet, and conversion content.',
  },
  {
    key: 'build-brand',
    label: 'Build the brand',
    sub: 'Evergreen content and thought leadership to grow awareness.',
    role: 'brand',
    strategyKey: 'content-seo',
    icon: '🏛️',
    seed: 'Draft a brand-building campaign for this brand: thought leadership, organic content, and a social series.',
  },
]
