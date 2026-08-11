// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { registerCampaign } from '../../domain/clients'
import type { Deliverable } from '../../domain/strategyAssets'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * A CAMPAIGN IS BUILT UP ONE DELIVERABLE AT A TIME, AND THE SECOND ONE HAS TO KNOW ABOUT THE FIRST.
 *
 * seedCampaignAssets APPENDS. Add "Instagram story" from the flow's ＋, then add it again from the
 * campaign brief, and the second run numbered its own #1/#2/#3 next to the first run's — it counted
 * within its own batch and never looked at what the campaign already held. Paid and brand assets
 * were worse: they take the bare label, so a second run produced the identical name outright. The
 * campaign then held two assets called the same thing, which the grid, the calendar and the task
 * list all showed as a pair of twins with no way to tell which was which.
 *
 * Driven through the store rather than unit-tested, because the numbering is a property of the
 * whole call — what makes it wrong is the state left by the previous one, which only a second call
 * can produce.
 *
 * Note for anyone extending this: seedCampaignAssets ends in refresh(), which reloads the rows from
 * the adapter. A row archived with setState does not survive that, so "a deleted asset frees its
 * name" cannot be driven from here — it needs a delete that persists.
 */

const CAMPAIGN = 'Acme — Fall Launch'

const story: Deliverable = {
  label: 'Instagram story',
  channel: 'instagram',
  assetType: 'story',
  media: 'image',
  perMonth: 3,
  runtime: 'organic' as never,
}
const landingPage: Deliverable = {
  label: 'Landing page',
  channel: 'landing-page',
  assetType: 'lead-capture',
  media: 'text',
  perMonth: 1,
  runtime: 'organic' as never,
  brand: true,
}

/** The campaign's live asset names, in the order the store holds them. */
const names = () =>
  useTrafficStore
    .getState()
    .rows.filter((r) => !r.archivedAt && (r.campaign ?? '').trim() === CAMPAIGN)
    .map((r) => r.assetName)

/** The campaign's live assets in CALENDAR order — the order someone actually reads them in. */
const namesByDate = () =>
  useTrafficStore
    .getState()
    .rows.filter((r) => !r.archivedAt && (r.campaign ?? '').trim() === CAMPAIGN)
    .slice()
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
    .map((r) => r.assetName)

beforeEach(() => {
  registerCampaign(CAMPAIGN, 'Acme')
  window.localStorage.clear()
  useTrafficStore.setState({ sharedSession: null, rows: [], campaignList: [{ name: CAMPAIGN, client: 'Acme', strategy: 'Current state' }] })
})

describe('seedCampaignAssets naming', () => {
  it('continues the numbering when the same deliverable is added twice', async () => {
    await useTrafficStore.getState().seedCampaignAssets(CAMPAIGN, [story], { flightWeeks: 4 })
    const first = names()
    expect(first).toEqual(['Instagram story #1', 'Instagram story #2', 'Instagram story #3'])

    await useTrafficStore.getState().seedCampaignAssets(CAMPAIGN, [story], { flightWeeks: 4 })

    expect(names()).toEqual([...first, 'Instagram story #4', 'Instagram story #5', 'Instagram story #6'])
    expect(new Set(names()).size, 'every name in the campaign is its own').toBe(names().length)
  })

  it('numbers a build-once asset rather than repeating its bare label', async () => {
    await useTrafficStore.getState().seedCampaignAssets(CAMPAIGN, [landingPage], { flightWeeks: 4 })
    expect(names(), 'the only one of its kind keeps the plain label').toEqual(['Landing page'])

    await useTrafficStore.getState().seedCampaignAssets(CAMPAIGN, [landingPage], { flightWeeks: 4 })

    // The bare name holds the "#1" slot, so the second reads as #2 rather than standing beside an
    // identical twin.
    expect(names()).toEqual(['Landing page', 'Landing page #2'])
  })

  /**
   * UNIQUE NAMES ARE NOT ENOUGH IF THE CALENDAR SHUFFLES THEM. Each run spread its own batch from
   * today across the whole flight, so a second run reproduced the first run's dates exactly — two
   * assets stacked on each day, and a series that read 1, 4, 2, 5, 3, 6 down the calendar. A run
   * resumes after whatever the campaign already has scheduled, so the numbers and the dates agree.
   */
  it('schedules a continued series after the one it continues, not back over it', async () => {
    await useTrafficStore.getState().seedCampaignAssets(CAMPAIGN, [story], { flightWeeks: 4 })
    // The first run has already used the flight, so this one has to carry past its end rather than
    // pile onto the last day.
    await useTrafficStore.getState().seedCampaignAssets(CAMPAIGN, [story], { flightWeeks: 4 })

    expect(namesByDate()).toEqual([
      'Instagram story #1',
      'Instagram story #2',
      'Instagram story #3',
      'Instagram story #4',
      'Instagram story #5',
      'Instagram story #6',
    ])

    // And no two land on the same day, which is what stacking looked like before.
    const days = useTrafficStore
      .getState()
      .rows.filter((r) => !r.archivedAt && (r.campaign ?? '').trim() === CAMPAIGN)
      .map((r) => r.scheduledAt.slice(0, 10))
    expect(new Set(days).size).toBe(days.length)
  })

  it('joins an existing series rather than standing an unnumbered sibling beside it', async () => {
    await useTrafficStore.getState().seedCampaignAssets(CAMPAIGN, [story], { flightWeeks: 4 })

    // A single one of something the campaign already runs three of. On its own this is a one-off
    // and would take the plain label — next to #1/#2/#3 that reads as a fourth nobody numbered.
    await useTrafficStore.getState().seedCampaignAssets(CAMPAIGN, [{ ...story, perMonth: 1 }], { flightWeeks: 4 })

    expect(names()).toEqual(['Instagram story #1', 'Instagram story #2', 'Instagram story #3', 'Instagram story #4'])
  })
})
