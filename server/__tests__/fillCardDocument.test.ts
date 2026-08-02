import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * FILLING A CARD FROM AN ATTACHED DOCUMENT.
 *
 * The rule the whole feature rests on: with a document attached, the document is the source and the
 * model's own knowledge of the subject is not. A messaging doc is usually about a real company the
 * model has read about, and the failure mode is a card that reads plausibly while citing nothing in
 * the file the person actually handed over. These assert the instruction is present, that the
 * document reaches the prompt whole rather than at the sentence-length cap, and that it arrives
 * AFTER the fields it is meant to fill.
 */

const captured: { system?: string; user?: string } = {}

vi.mock('../modelClient.js', () => ({
  makeModelClient: () => ({
    messages: {
      create: async (req: { system: string; messages: { content: string }[] }) => {
        captured.system = req.system
        captured.user = req.messages[0]?.content
        return { content: [{ type: 'text', text: JSON.stringify({ name: 'Ops leads' }) }] }
      },
    },
  }),
}))

let runFillCard: (b: unknown) => Promise<unknown>

const FIELDS = [
  { key: 'name', brief: 'a short name for this audience' },
  { key: 'pains', brief: 'what is wrong today', kind: 'list' as const },
]

beforeEach(async () => {
  process.env.OPENROUTER_API_KEY = 'test-key'
  captured.system = undefined
  captured.user = undefined
  ;({ runFillCard } = await import('../fillCardHandler.js'))
})
afterEach(() => {
  delete process.env.OPENROUTER_API_KEY
})

describe('a card filled from a document', () => {
  it('binds the model to the document rather than to what it knows', async () => {
    await runFillCard({
      kind: 'audience',
      fields: FIELDS,
      document: { name: 'personas.md', text: '# RevOps leads\n\nThey own the CRM and hate manual reporting.' },
    })
    expect(captured.system).toContain('READING A DOCUMENT')
    expect(captured.system).toContain('Do not fill a field from your own knowledge')
    expect(captured.user).toContain('hate manual reporting')
    expect(captured.user).toContain('personas.md')
  })

  it('leaves the document rules off when there is only a typed sentence', async () => {
    await runFillCard({ kind: 'audience', prompt: 'Heads of RevOps at Series B companies', fields: FIELDS })
    expect(captured.system).not.toContain('READING A DOCUMENT')
    expect(captured.user).toContain('Heads of RevOps')
  })

  it('sends the document whole, past the cap a typed description is held to', async () => {
    // Longer than the 1200 characters a typed prompt is cut at: pasting a brief into the description
    // box was silently truncated there, which is the failure the attachment exists to fix.
    const body = `${'The pain is manual reporting. '.repeat(200)}`
    await runFillCard({ kind: 'audience', fields: FIELDS, document: { name: 'brief.md', text: body } })
    expect(captured.user!.length).toBeGreaterThan(4000)
  })

  it('clamps a document nobody should have been able to send', async () => {
    await runFillCard({ kind: 'audience', fields: FIELDS, document: { name: 'huge.md', text: 'x'.repeat(60_000) } })
    expect(captured.user).toContain('x'.repeat(24_000))
    expect(captured.user).not.toContain('x'.repeat(24_001))
  })

  it('puts the document AFTER the fields, so the instruction is not buried under it', async () => {
    await runFillCard({
      kind: 'audience',
      fields: FIELDS,
      document: { name: 'brief.md', text: 'They own the CRM.' },
    })
    expect(captured.user!.indexOf('FIELDS YOU MAY FILL')).toBeLessThan(captured.user!.indexOf('THE ATTACHED DOCUMENT'))
  })

  it('takes a document and a typed note together, since that is the useful case', async () => {
    await runFillCard({
      kind: 'audience',
      prompt: 'Only the enterprise half of this',
      fields: FIELDS,
      document: { name: 'brief.md', text: 'Two segments: SMB and enterprise.' },
    })
    expect(captured.user).toContain('Only the enterprise half')
    expect(captured.user).toContain('Two segments')
  })

  it('still refuses when there is neither a description nor a document', async () => {
    await expect(runFillCard({ kind: 'audience', fields: FIELDS })).rejects.toThrow(/Nothing to go on/)
    await expect(runFillCard({ kind: 'audience', fields: FIELDS, document: { text: '   ' } })).rejects.toThrow(/Nothing to go on/)
  })

  it('reports how much of the document it read, so the note can say so', async () => {
    const out = (await runFillCard({
      kind: 'audience',
      fields: FIELDS,
      document: { name: 'brief.md', text: 'They own the CRM.' },
    })) as { readChars: number; filled: number }
    expect(out.readChars).toBe('They own the CRM.'.length)
    expect(out.filled).toBe(1)
  })
})
