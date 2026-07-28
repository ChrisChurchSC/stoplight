/**
 * The conversion outcomes an audience can be driven toward. Org-type dependent (nonprofit
 * Donate/Volunteer, SaaS Sign up/Buy, media Subscribe/Listen), so this is a suggestion vocabulary,
 * not a hard enum. Shared by FoundationView, the audience angle recommender (draftAngle), and its
 * server prompt so the list stays in one place.
 */
export const OUTCOMES = [
  'Donate',
  'Subscribe',
  'Invest',
  'Listen to the podcast',
  'Attend a screening',
  'Volunteer',
  'Partner',
  'Sign up',
  'Share',
  'Buy',
] as const
