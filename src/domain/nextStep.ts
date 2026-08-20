/**
 * WHERE THIS WORKSPACE IS, AND THE ONE THING TO DO NEXT.
 *
 * The connector is sixty-odd tools and no path through them. A model handed that list can call any
 * of them at any time, so a conversation starts wherever the person's first sentence happens to
 * land: assets generated for a brand that has no audiences, a campaign built before anyone said
 * what it was for. Every tool works. The order nobody stated is what goes wrong.
 *
 * This is that order, made explicit and answered against the REAL workspace rather than in the
 * abstract. It reads as a ladder because the work is one: a brand, then what it sells and who to,
 * then the goal, then a campaign, then the direction behind it, then the assets, then the gaps,
 * then the review. Each rung knows how to tell whether it is done, what to ask the person when it
 * is not, and which calls would finish it.
 *
 * THE ASK MATTERS AS MUCH AS THE ACTION. Two rungs are questions rather than commands — the goal,
 * and which channels this campaign should live on — because the app cannot infer either and
 * guessing produces a campaign that is coherent, complete and aimed at nothing. A tool that only
 * ever returned actions would have the model quietly pick both.
 *
 * Pure, so the ladder can be tested against a hand-built workspace rather than by clicking one up.
 */

export type StageKey =
  | 'brand'
  | 'profile'
  | 'goal'
  | 'campaign'
  | 'direction'
  | 'assets'
  | 'journey'
  | 'finish'
  | 'review'
  | 'approve'

/** One thing to do, named as the literal call so acting on it needs no translation. */
export interface NextAction {
  call: string
  what: string
}

export interface Rung {
  key: StageKey
  label: string
  done: boolean
}

export interface NextStep {
  /** The first unfinished rung, or 'approve' when everything below it is done. */
  stage: StageKey
  /** Where the workspace is, in one line. */
  headline: string
  /** Why this rung is worth doing before the ones after it. */
  why: string
  /**
   * The question to put to the PERSON, when this rung needs an answer the app cannot infer.
   * Absent on rungs that are simply work to be done.
   */
  ask?: string
  actions: NextAction[]
  /** The whole ladder with each rung's state, so the chat can say where this sits in the work. */
  ladder: Rung[]
  /** True when there is nothing left to raise. */
  complete: boolean
}

export interface WorkspaceSnapshot {
  /** Brands in the workspace. */
  brands: string[]
  /** The brand in question, when one is chosen. */
  brand?: string
  /** How much the brand knows about itself. */
  audiences: number
  proofPoints: number
  /** The GTM motion, once somebody has said what this is for. */
  strategy?: string
  /**
   * True when that motion was INFERRED off the brand's site rather than answered by a person.
   * Setup writes its guess into the same field a decision goes in, and once written the two are
   * indistinguishable — so the one question this ladder exists to force goes unasked, because
   * something is already sitting where the answer would have gone.
   */
  strategyInferred?: boolean
  /** The campaign in question, and whether it exists. */
  campaign?: string
  campaignExists: boolean
  /** Campaigns the brand already has — the difference between "make one" and "which one?". */
  campaignCount: number
  /** Object cards on the campaign's board: how many ask for direction, and how many carry any. */
  cardsAskingDirection: number
  cardsWithDirection: number
  /** The campaign's assets. */
  assetCount: number
  /** Assets with at least one component still blank. */
  unfinishedAssets: number
  approvedAssets: number
  /** Funnel stages with no channel yet, and what would fill them. */
  uncoveredStages: { label: string; suggest: string[] }[]
  /**
   * Whether a review has been run FOR THIS SCOPE, and what it found. A run against a different
   * campaign says nothing about this one.
   */
  reviewRun: boolean
  reviewFindings: number
  /** It ran, but the copy has been edited since — its findings describe an older campaign. */
  reviewStale?: boolean
}

const LABELS: Record<StageKey, string> = {
  brand: 'A brand to write as',
  profile: 'Who it sells to, and what backs it up',
  goal: 'What this campaign is for',
  campaign: 'A campaign to work in',
  direction: 'Direction behind the campaign',
  assets: 'Assets to review',
  journey: 'Channels across the journey',
  finish: 'Every component filled',
  review: 'Reviewed',
  approve: 'Approved and shippable',
}

/** Each rung's own test, in the order the work happens. */
function rungsFor(s: WorkspaceSnapshot): Rung[] {
  const hasBrand = !!s.brand || s.brands.length > 0
  return [
    { key: 'brand', label: LABELS.brand, done: hasBrand },
    { key: 'profile', label: LABELS.profile, done: s.audiences > 0 && s.proofPoints > 0 },
    // An inferred motion does not close this rung. Something is in the field, but nobody has said
    // what the campaign is for, and that is what the rung is asking.
    { key: 'goal', label: LABELS.goal, done: !!s.strategy && !s.strategyInferred },
    { key: 'campaign', label: LABELS.campaign, done: s.campaignExists },
    // A board of cards that all ask for direction and none carry it is the failure worth catching;
    // a board whose cards ask for none (a Voice, a Concept) is not unfinished.
    { key: 'direction', label: LABELS.direction, done: s.cardsAskingDirection === 0 || s.cardsWithDirection > 0 },
    { key: 'assets', label: LABELS.assets, done: s.assetCount > 0 },
    { key: 'journey', label: LABELS.journey, done: s.uncoveredStages.length === 0 },
    { key: 'finish', label: LABELS.finish, done: s.assetCount > 0 && s.unfinishedAssets === 0 },
    { key: 'review', label: LABELS.review, done: s.reviewRun && !s.reviewStale && s.reviewFindings === 0 },
    { key: 'approve', label: LABELS.approve, done: s.assetCount > 0 && s.approvedAssets >= s.assetCount },
  ]
}

const q = (v: string | undefined, fallback: string) => (v && v.trim() ? `"${v.trim()}"` : fallback)

export function nextStep(s: WorkspaceSnapshot): NextStep {
  const ladder = rungsFor(s)
  const open = ladder.find((r) => !r.done)
  const brand = q(s.brand, 'the brand')
  const campaign = q(s.campaign, 'the campaign')

  if (!open) {
    return {
      stage: 'approve',
      headline: `${campaign} is written, reviewed and approved.`,
      why: 'Nothing is outstanding.',
      actions: [{ call: `list_assets(campaign: ${campaign}, status: ["approved"])`, what: 'Read back the shippable set' }],
      ladder,
      complete: true,
    }
  }

  const step = (partial: Omit<NextStep, 'ladder' | 'complete' | 'stage'>): NextStep => ({
    ...partial,
    stage: open.key,
    ladder,
    complete: false,
  })

  switch (open.key) {
    case 'brand':
      return step({
        headline: 'This workspace has no brand yet.',
        why: 'Every canvas writes AS somebody. With no brand there is no voice to write in.',
        ask: 'Whose brand are we working on, and what is its website?',
        actions: [
          { call: 'setup_client(url: …)', what: 'Crawl the site and provision the whole workspace from it' },
          { call: 'add_client(name: …)', what: 'Start empty, if there is no site to read' },
        ],
      })

    case 'profile':
      return step({
        headline: `${brand} does not yet say who it sells to or what backs its claims (${s.audiences} audience(s), ${s.proofPoints} proof point(s)).`,
        why: 'With neither, the writer falls back to the whole library and the copy comes out fluent and aimed at nobody.',
        ask: 'Who is this for, and what proof do we have that it works — a number, a customer, a result?',
        actions: [
          { call: `pull_live_assets(url: …)`, what: 'Read audiences and proof off what the brand already has live' },
          { call: `add_audience(brand: ${brand}, name: …)`, what: 'Name an audience by hand' },
          { call: `add_proof_point(brand: ${brand}, claim: …)`, what: 'Add a reason to believe' },
        ],
      })

    case 'goal':
      // A motion setup guessed is the harder half of this rung. setup_client reads one off the
      // site and stores it, so the field is full and the rung would read as answered — and the
      // question the connector is careful never to infer would be the one thing nobody asks.
      // A guess holds the rung open until a person says yes to it.
      if (s.strategy && s.strategyInferred) {
        return step({
          headline: `${brand}'s motion is set to "${s.strategy}", but setup inferred it — nobody has confirmed it.`,
          why: 'The motion decides the funnel, the KPIs and which deliverables get seeded. An inferred one reads exactly like a decision, and everything generated after it inherits the guess.',
          ask: `Setup read ${brand} as "${s.strategy}". Is that the goal here, or is this campaign for something else?`,
          actions: [
            { call: `get_strategy(brand: ${brand})`, what: 'Read the rationale and the signals it was inferred from, so the question is a real one' },
            { call: `set_strategy(brand: ${brand}, strategy: …)`, what: 'Record their answer — the same motion still counts, confirming is what marks it decided' },
          ],
        })
      }
      return step({
        headline: `${brand} has no stated GTM motion.`,
        why: 'The motion decides the funnel, the KPIs and which deliverables get seeded — it cannot be inferred from the brand, and guessing it produces a campaign aimed at nothing.',
        ask: 'What is the goal here — what does success look like? (demand capture, product-led signups, named-account ABM, lifecycle retention, community, local…)',
        actions: [{ call: `set_strategy(brand: ${brand}, strategy: …)`, what: 'Set the motion once the person has said what they want' }],
      })

    case 'campaign': {
      // THE ENTRY-POINT CASE. The instructions say to call this first in a session, and at that
      // point nobody has named a campaign yet — so the honest answer is a question. Saying "no
      // campaign called the campaign" and offering new_campaign is how a brand with four campaigns
      // gets a fifth: the model reads a missing argument as a missing campaign.
      const named = !!s.campaign?.trim()
      if (!named && s.campaignCount > 0) {
        return step({
          headline: `${brand} has ${s.campaignCount} campaign(s), and this answer is about the brand as a whole.`,
          why: 'Direction, assets, the review and the approval are all per-campaign — none of the rungs below can be answered until you say which one.',
          ask: 'Which campaign are we working on — or is this a new one?',
          actions: [
            { call: `whats_next(brand: ${brand}, campaign: …)`, what: 'Ask again about one campaign to get the rest of the ladder' },
            { call: `get_brand(brand: ${brand})`, what: 'Read the campaigns it already has, to ask with the names in hand' },
            { call: `new_campaign(brand: ${brand}, name: …)`, what: 'Start a new one instead, once they have said so' },
          ],
        })
      }
      return step({
        headline: named ? `${brand} has no campaign called ${campaign} yet.` : `${brand} has no campaigns yet.`,
        why: 'Assets, boards and reviews all hang off a campaign.',
        ask: 'What should this campaign be called, and what is it announcing?',
        actions: [{ call: `new_campaign(brand: ${brand}, name: …)`, what: 'Create it' }],
      })
    }

    case 'direction':
      return step({
        headline: `${campaign} has ${s.cardsAskingDirection} card(s) on its board and none of them instruct the writer.`,
        why: 'Direction is what a card contributes. Without it the copy is written from the brief alone, while the board looks like context.',
        ask: 'What should this campaign lean on — the pain it argues from, the objection it has to beat, the claim it asserts?',
        actions: [
          { call: `get_object_fields(kind: "audience")`, what: 'See what an audience card asks for' },
          { call: `add_object_card(campaign: ${campaign}, kind: "audience", fields: { pain, objection })`, what: 'Put the audience behind the campaign' },
          { call: `list_object_cards(campaign: ${campaign})`, what: 'See what is already on the board' },
        ],
      })

    case 'assets':
      return step({
        headline: `${campaign} has no assets.`,
        why: 'Everything downstream — the review, the approval, the schedule — is about assets.',
        actions: [
          { call: `generate_assets(brand: ${brand}, campaign: ${campaign})`, what: "Seed the motion's deliverables and write the copy" },
          { call: `add_asset(brand: ${brand}, campaign: ${campaign}, …)`, what: 'Hand-author a one-off instead' },
        ],
      })

    case 'journey': {
      const gaps = s.uncoveredStages
      return step({
        headline: `Nothing runs at ${gaps.map((g) => g.label.toLowerCase()).join(' or ')} on ${campaign}.`,
        why: 'A journey with a missing stage asks the reader to jump a gap the campaign never built.',
        ask: `Should we add a channel for ${gaps.map((g) => `${g.label.toLowerCase()} (${g.suggest.slice(0, 3).join(', ') || 'any channel'})`).join(' and ')}?`,
        actions: gaps.map((g) => ({
          call: `add_asset(campaign: ${campaign}, channel: "${g.suggest[0] ?? '…'}", …)`,
          what: `Cover ${g.label.toLowerCase()}`,
        })),
      })
    }

    case 'finish':
      return step({
        headline: `${s.unfinishedAssets} of ${s.assetCount} assets on ${campaign} still have blank components.`,
        why: 'A blank component renders blank on the card and ships blank.',
        actions: [
          { call: `review_campaign(campaign: ${campaign}, includeCopyCheck: false)`, what: 'List exactly which components, per asset' },
          { call: `list_assets(campaign: ${campaign})`, what: 'Read each asset back with its filled/missing fields' },
        ],
      })

    case 'review':
      return step({
        headline: s.reviewStale
          ? `${campaign} was reviewed, but its copy has been edited since — those findings describe an older campaign.`
          : s.reviewRun
            ? `The last review of ${campaign} left ${s.reviewFindings} finding(s) open.`
            : `${campaign} has not been reviewed.`,
        why: 'The review is where a claim with no proof, a dead CTA and a half-built card get caught before anyone sees them.',
        actions: [
          { call: `review_campaign(campaign: ${campaign})`, what: 'Everything worth doing, ranked, each with its fix' },
          { call: 'apply_fix(breakId: …)', what: 'Apply a mechanical fix the review named' },
        ],
      })

    case 'approve':
      return step({
        headline: `${s.approvedAssets} of ${s.assetCount} assets on ${campaign} are approved.`,
        why: 'Only approved assets are the shippable set.',
        ask: 'Do you want to read these through before approving, or approve the set?',
        actions: [
          { call: `list_assets(campaign: ${campaign})`, what: 'Read them first' },
          { call: `approve_assets(campaign: ${campaign})`, what: 'Approve the rest' },
        ],
      })
  }
}
