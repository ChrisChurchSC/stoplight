import { describe, expect, it } from 'vitest'
import { starterQuestions } from '../gretelQuestions'

/**
 * The starter question is the whole product of the hand-off dialog: the user does not type it, so
 * if it is vague or names nothing, the agent on the other side has nothing to look up and the
 * click was worse than useless. These guard the two things that make it answerable — it is never
 * empty, and it names what is on screen.
 */
describe('starterQuestions', () => {
  it('always offers something, even with no brand and no campaign', () => {
    const qs = starterQuestions()
    expect(qs.length).toBeGreaterThan(0)
    expect(qs.every((q) => q.trim().length > 0)).toBe(true)
  })

  it('names the campaign and the brand, so the connector can look both up', () => {
    const [first] = starterQuestions({ brand: 'Acme', campaign: 'Spring Launch' })
    expect(first).toContain('Spring Launch')
    expect(first).toContain('Acme')
  })

  it('asks about the real deliverables when the campaign has some', () => {
    const qs = starterQuestions({ campaign: 'Spring Launch', deliverables: ['Newsletter', 'Instagram Reel'] })
    expect(qs.some((q) => q.includes('Newsletter') && q.includes('Instagram Reel'))).toBe(true)
  })

  it('lists at most three deliverables, so a question stays a question', () => {
    const qs = starterQuestions({ campaign: 'C', deliverables: ['A', 'B', 'C4', 'D', 'E'] })
    const deliverableQ = qs.find((q) => q.includes('runs '))
    expect(deliverableQ).toBeDefined()
    expect(deliverableQ).not.toContain('D')
  })

  it('drops blank deliverable labels rather than asking about ""', () => {
    const qs = starterQuestions({ campaign: 'C', deliverables: ['   ', ''] })
    expect(qs.some((q) => q.includes('runs '))).toBe(false)
  })

  it('names the app once, not twice, when the brand is also called Breadcrumbs', () => {
    const qs = starterQuestions({ brand: 'Breadcrumbs', campaign: 'Spring Launch' })
    const campaignQ = qs.find((q) => q.includes('Spring Launch'))!
    expect(campaignQ.match(/Breadcrumbs/g)).toHaveLength(1)
    expect(campaignQ.startsWith('Look at')).toBe(true)
  })

  it("uses a bare apostrophe for a brand already ending in s", () => {
    const qs = starterQuestions({ brand: 'Breadcrumbs' })
    expect(qs.some((q) => q.includes("Breadcrumbs's"))).toBe(false)
    expect(qs.some((q) => q.includes("Breadcrumbs' campaigns"))).toBe(true)
    expect(starterQuestions({ brand: 'Acme' }).some((q) => q.includes("Acme's campaigns"))).toBe(true)
  })

  it('falls back to a workspace-level question when nothing is selected', () => {
    const qs = starterQuestions({ brand: null, campaign: '  ' })
    expect(qs).toHaveLength(1)
    expect(qs[0]).toContain('workspace')
  })
})
