/**
 * The starter questions the hand-off dialog offers (components/GretelHandoff.tsx).
 *
 * A hand-off is only worth the click if the question that travels with it is better than the one
 * the user would have typed. So these are built from what is actually on screen — the brand, the
 * campaign, the channels it runs — and they NAME those things, because the connector's tools look
 * things up by name. "What's weak here?" is useless in another app; "What's weak about the Spring
 * Launch campaign for Acme?" is a question an agent with the connector can actually answer.
 *
 * Pure and ordered: best first, and never empty. The last entry is a workspace-level question that
 * holds up with no brand and no campaign, which is exactly the state a new account is in.
 */

export interface StarterContext {
  /** The brand in scope, if one is selected. */
  brand?: string | null
  /** The open campaign's name. Absent on a blank or unnamed campaign. */
  campaign?: string | null
  /** What the campaign is about, if it has been filled in. */
  subject?: string | null
  /** Human labels for the campaign's deliverables ("Newsletter", "Instagram Reel"). */
  deliverables?: string[]
  /** The GTM motion's display name, if one is set. */
  strategy?: string | null
}

/** The product's own name, so the agent knows which connector answers this. */
const APP = 'Breadcrumbs'

/** "Acme's", but "Breadcrumbs'" — a name already ending in s takes the bare apostrophe. */
const possessive = (name: string): string => (/s$/i.test(name) ? `${name}'` : `${name}'s`)

/** "a, b and c" — trimmed to three so a question stays a question rather than a manifest. */
function listOf(items: string[]): string {
  const xs = items.slice(0, 3)
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

export function starterQuestions(ctx: StarterContext = {}): string[] {
  const brand = (ctx.brand ?? '').trim()
  const campaign = (ctx.campaign ?? '').trim()
  const subject = (ctx.subject ?? '').trim()
  const strategy = (ctx.strategy ?? '').trim()
  const delivs = (ctx.deliverables ?? []).map((d) => d.trim()).filter(Boolean)
  // Every question that names a campaign also names its brand where there is one, since two brands
  // can both have a "Q1 Launch" and the connector would have to guess which.
  const of = brand ? ` for ${brand}` : ''
  /**
   * The app is named so the agent knows which connector to reach for — but ONCE. A brand called
   * Breadcrumbs (this workspace has one) turned every question into "In Breadcrumbs, review all of
   * Breadcrumbs's campaigns", which reads like a typo and tells the agent nothing the brand name
   * had not already. When the brand IS the app, the brand name is doing the work; drop the prefix.
   */
  const inApp = brand.toLowerCase() === APP.toLowerCase() ? '' : `In ${APP}, `
  // Sentence case survives an empty prefix: "In Breadcrumbs, look at…" vs "Look at…".
  const lead = (rest: string) => (inApp ? inApp + rest : rest.charAt(0).toUpperCase() + rest.slice(1))
  const qs: string[] = []

  if (campaign) {
    qs.push(
      lead(`look at the “${campaign}” campaign${of} and tell me what's weak about it — gaps, overlaps, or channels doing no real work.`),
    )
    if (delivs.length) {
      qs.push(
        `“${campaign}”${of} runs ${listOf(delivs)}. Which of those is carrying the least weight, and what would you add or cut?`,
      )
    }
    qs.push(
      `Does “${campaign}”${of} reach the right audiences${subject ? `, given it's about ${subject}` : ''}? Name who we're missing.`,
    )
    if (strategy) {
      qs.push(`“${campaign}”${of} is running a ${strategy} motion. Is the channel mix and cadence right for that motion?`)
    }
  }

  if (brand) {
    qs.push(
      lead(`review all of ${possessive(brand)} campaigns. Where do they overlap, and which audiences is nothing aimed at?`),
    )
    qs.push(`What does ${possessive(brand)} positioning and proof say we should be arguing that our campaigns currently don't?`)
  }

  qs.push(
    `Read my ${APP} workspace — brands, campaigns, and assets — and tell me what's set up, what's half-finished, and what to do next.`,
  )
  return qs
}
