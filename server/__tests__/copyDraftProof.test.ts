import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * AN UNVETTED PROOF POINT MUST NOT ARRIVE WITH A NUMBER.
 *
 * The store withholds metric and source from any proof marked approved:false, but the rule only
 * holds if the writer is also told what a draft is. These assert the instruction is present and that
 * a draft's number never appears in the prompt, which is the half a refactor would quietly drop.
 */

const captured: { system?: string; user?: string } = {}

vi.mock('../modelClient.js', () => ({
  makeModelClient: () => ({
    messages: {
      create: async (req: { system: string; messages: { content: string }[] }) => {
        captured.system = req.system
        captured.user = req.messages[0]?.content
        return { content: [{ type: 'text', text: JSON.stringify({ rtbs: [], drafts: [] }) }] }
      },
    },
  }),
}))

let runCopyDraft: (b: unknown) => Promise<unknown>

beforeEach(async () => {
  process.env.OPENROUTER_API_KEY = 'test-key'
  captured.system = undefined
  captured.user = undefined
  ;({ runCopyDraft } = await import('../copyDraftHandler.js'))
})
afterEach(() => {
  delete process.env.OPENROUTER_API_KEY
})

describe('draft proof points', () => {
  it('binds the writer with the no-number rule', async () => {
    await runCopyDraft({ icp: null, campaign: 'x', assets: [], proofPool: [] })
    expect(captured.system).toContain('A DRAFT PROOF POINT HAS NO NUMBER')
    expect(captured.system).toContain('do not put a figure')
  })

  it('a draft proof point reaches the prompt with its claim and without its metric', async () => {
    await runCopyDraft({
      icp: null,
      campaign: 'x',
      assets: [],
      // What the store sends for approved:false: metric and source already stripped.
      proofPool: [{ id: 'r1', label: 'Cuts onboarding time', detail: 'From two pilots', draft: true }],
    })
    expect(captured.user).toContain('Cuts onboarding time')
    expect(captured.user).toContain('"draft": true')
    expect(captured.user).not.toContain('40%')
  })

  it('an approved proof point still carries its number', async () => {
    await runCopyDraft({
      icp: null,
      campaign: 'x',
      assets: [],
      proofPool: [{ id: 'r2', label: 'Cuts onboarding time', metric: '40%', source: 'Pilot study' }],
    })
    expect(captured.user).toContain('40%')
    expect(captured.user).toContain('Pilot study')
  })
})
