import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * What actually reaches the model.
 *
 * The destructure at the top of runCopyDraft is the failure mode worth a test of its own: a field
 * that is not named there vanishes with no error, no log and nothing red, which is exactly how the
 * `hooks` field was silently dropped for weeks. So these assert on the request body the handler
 * hands to the model client, not on its return value.
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

const figure = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  value: '1,240',
  label: 'Clicks on the query marine survey',
  basis: 'cell',
  period: '90 days to 14 Mar 2026',
  source: 'Search Console, 90 days to 14 Mar 2026',
  partial: false,
  datasetId: 'ds_1',
  ...over,
})

const body = (datasets: unknown) => ({
  icp: null,
  campaign: 'Spring',
  assets: [{ rowId: 'r1', assetName: 'Post', channel: 'linkedin', fields: [] }],
  datasets,
})

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

describe('figures reaching the writer', () => {
  it('survives the destructure and appears once per figure', async () => {
    const figs = [figure(), figure({ id: 'f2', value: '62%', label: 'Share of clicks from marine survey', basis: 'share' })]
    await runCopyDraft(body(figs))
    expect(captured.user).toContain('FIGURES')
    expect(captured.user?.split('1,240').length ?? 0).toBe(2)
    expect(captured.user).toContain('62%')
    expect(captured.user).toContain('Search Console')
  })

  it('sends no FIGURES block at all when the list is empty', async () => {
    // This is the sketched case: citableFigures returned [], so nothing about that table travels,
    // including its name and its columns.
    await runCopyDraft(body([]))
    expect(captured.user).not.toContain('FIGURES')
  })

  it('never mentions a sketched table, because it was never in the payload', async () => {
    await runCopyDraft({ ...body([]), campaign: 'Spring' })
    expect(captured.user).not.toContain('Revenue lift after switching')
    expect(captured.user).not.toContain('Sketched')
  })

  it('drops a figure with no source, rather than sending it half formed', async () => {
    await runCopyDraft(body([figure({ source: '' }), figure({ id: 'f2', value: '600', label: 'Clicks on hull survey' })]))
    expect(captured.user).not.toContain('1,240')
    expect(captured.user).toContain('600')
  })

  it('drops a figure with no value or no label', async () => {
    await runCopyDraft(body([figure({ value: '   ' }), figure({ id: 'f2', label: '' })]))
    expect(captured.user).not.toContain('FIGURES')
  })

  it('caps the campaign at twelve figures', async () => {
    const many = Array.from({ length: 30 }, (_, i) => figure({ id: `f${i}`, value: `${1000 + i}` }))
    await runCopyDraft(body(many))
    const sent = many.filter((f) => captured.user?.includes(f.value))
    expect(sent.length).toBe(12)
  })

  it('binds the writer with the quote-never-calculate rules', async () => {
    await runCopyDraft(body([figure()]))
    expect(captured.system).toContain('A FIGURE IS QUOTED, NEVER CALCULATED')
    expect(captured.system).toContain('A FIGURE CARRIES ITS PERIOD AND ITS SOURCE')
    expect(captured.system).toContain('HOLDING DATA IS NOT A CLAIM')
  })

  it('marks a partial figure as partial, so it cannot be called a total', async () => {
    await runCopyDraft(body([figure({ partial: true })]))
    expect(captured.user).toContain('"partial": true')
  })

  it('ignores a datasets field that is not an array', async () => {
    await runCopyDraft(body({ nope: true }))
    expect(captured.user).not.toContain('FIGURES')
  })
})
