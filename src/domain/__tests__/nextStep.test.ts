import { describe, expect, it } from 'vitest'
import { nextStep, type WorkspaceSnapshot } from '../nextStep'

/**
 * THE ORDER NOBODY STATED.
 *
 * Sixty tools and no path through them means a session starts wherever the person's first sentence
 * lands, and the model supplies an order of its own: assets generated for a brand with no
 * audiences, a campaign built before anyone said what it was for. Every call succeeds. What comes
 * out is confident work aimed at nothing.
 *
 * These pin the ladder — that it reports the FIRST unfinished rung and not a later one, that the
 * two rungs the app cannot infer come back as questions rather than actions, and that a rung which
 * genuinely does not apply is not reported as unfinished forever.
 */

const snap = (over: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot => ({
  brands: ['Acme'],
  brand: 'Acme',
  audiences: 2,
  proofPoints: 2,
  strategy: 'demand-gen',
  campaign: 'Q4 launch',
  campaignExists: true,
  cardsAskingDirection: 2,
  cardsWithDirection: 2,
  assetCount: 6,
  unfinishedAssets: 0,
  approvedAssets: 6,
  uncoveredStages: [],
  reviewRun: true,
  reviewFindings: 0,
  ...over,
})

describe('the rung it reports', () => {
  it('is the FIRST unfinished one, not a later one', () => {
    // No brand AND no assets: the answer is the brand, because nothing above it can be done.
    const step = nextStep(snap({ brands: [], brand: undefined, audiences: 0, proofPoints: 0, strategy: undefined, assetCount: 0, campaignExists: false }))
    expect(step.stage).toBe('brand')
  })

  it('walks down the ladder as each rung is satisfied', () => {
    const order: [Partial<WorkspaceSnapshot>, string][] = [
      [{ brands: [], brand: undefined }, 'brand'],
      [{ audiences: 0 }, 'profile'],
      [{ proofPoints: 0 }, 'profile'],
      [{ strategy: undefined }, 'goal'],
      [{ campaignExists: false }, 'campaign'],
      [{ cardsWithDirection: 0 }, 'direction'],
      [{ assetCount: 0 }, 'assets'],
      [{ uncoveredStages: [{ label: 'Conversion', suggest: ['Landing page'] }] }, 'journey'],
      [{ unfinishedAssets: 3 }, 'finish'],
      [{ reviewRun: false }, 'review'],
      [{ reviewFindings: 4 }, 'review'],
      [{ approvedAssets: 0 }, 'approve'],
    ]
    for (const [over, expected] of order) {
      expect(nextStep(snap(over)).stage, JSON.stringify(over)).toBe(expected)
    }
  })

  it('reports complete only when every rung is done', () => {
    const done = nextStep(snap())
    expect(done.complete).toBe(true)
    expect(done.ladder.every((r) => r.done)).toBe(true)
    expect(nextStep(snap({ unfinishedAssets: 1 })).complete).toBe(false)
  })
})

describe('what it asks rather than decides', () => {
  it('asks what the goal is instead of picking a motion', () => {
    const step = nextStep(snap({ strategy: undefined }))
    expect(step.stage).toBe('goal')
    expect(step.ask).toMatch(/goal|success/i)
    // The action is there to run AFTER the answer, never instead of asking.
    expect(step.actions[0].call).toContain('set_strategy')
  })

  it('asks which channels, and names ones that would fill the gap', () => {
    const step = nextStep(snap({ uncoveredStages: [{ label: 'Conversion', suggest: ['Landing page', 'Email'] }] }))
    expect(step.stage).toBe('journey')
    expect(step.ask).toContain('Landing page')
    expect(step.headline).toContain('conversion')
  })

  it('asks for the campaign’s argument when the board instructs nothing', () => {
    const step = nextStep(snap({ cardsAskingDirection: 4, cardsWithDirection: 0 }))
    expect(step.stage).toBe('direction')
    expect(step.headline).toContain('4 card(s)')
    expect(step.ask).toMatch(/pain|objection|claim/i)
    expect(step.actions.some((x) => x.call.includes('add_object_card'))).toBe(true)
  })

  it('does not ask on rungs that are simply work', () => {
    expect(nextStep(snap({ assetCount: 0 })).ask).toBeUndefined()
    expect(nextStep(snap({ unfinishedAssets: 2 })).ask).toBeUndefined()
  })
})

describe('rungs that do not apply', () => {
  it('does not hold a board of cards that ask for no direction against it', () => {
    // A board of Voice and Concept cards contributes through its records; there is no direction to
    // give, and reporting it unfinished forever would send an agent after a field that is not there.
    const step = nextStep(snap({ cardsAskingDirection: 0, cardsWithDirection: 0, assetCount: 0 }))
    expect(step.stage).toBe('assets')
  })
})

describe('what every answer carries', () => {
  it('names the workspace, not a generic step, and gives calls to make', () => {
    const step = nextStep(snap({ campaign: 'Q4 launch', unfinishedAssets: 3, assetCount: 6 }))
    expect(step.headline).toContain('Q4 launch')
    expect(step.headline).toContain('3 of 6')
    expect(step.why).not.toBe('')
    expect(step.actions.length).toBeGreaterThan(0)
    for (const a of step.actions) {
      expect(a.call).not.toBe('')
      expect(a.what).not.toBe('')
    }
  })

  it('returns the whole ladder so progress is visible, not just the next step', () => {
    const step = nextStep(snap({ strategy: undefined }))
    expect(step.ladder).toHaveLength(10)
    expect(step.ladder.find((r) => r.key === 'brand')!.done).toBe(true)
    expect(step.ladder.find((r) => r.key === 'goal')!.done).toBe(false)
  })
})
