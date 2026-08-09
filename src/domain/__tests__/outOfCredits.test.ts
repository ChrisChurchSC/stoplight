import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * RUNNING OUT OF CREDITS IS NOT "NO AI MODEL CONNECTED".
 *
 * apiRoute maps NO_KEY and NO_BUDGET to the same 501 on purpose: every client adapter reads that
 * status as "no model available, use the heuristic writer", and an exhausted account is that state.
 * The status is right. The SENTENCE was not — the writer returned "No AI model connected" for both,
 * so an account that had been working fine and had simply run out reported itself as a deployment
 * that was never wired up. Nothing in the app said the words "out of credits", generation did not
 * fail (it falls back to templates), and the only visible trace was a note pointing at the wrong
 * cause.
 *
 * The code was in the body the whole time — apiRoute sends `{ error: code }` — and the status checks
 * returned before anything read it. Driven through the public writer rather than the private
 * helper, because what matters is the sentence that reaches the notice over the canvas.
 */

const ORIGINAL_FETCH = globalThis.fetch

/** A stub endpoint that fails every batch with one status and body. */
function failWith(status: number, body: unknown) {
  return vi.fn(async () => ({ ok: false, status, json: async () => body }))
}

const assets = [{ rowId: 'r1', assetName: 'Post 1', channel: 'linkedin', fields: [] }]

const fallback = {
  draft: async (req: { assets?: { rowId: string }[] }) => ({
    rtbs: [],
    drafts: (req.assets ?? []).map((a) => ({ rowId: a.rowId, components: [], rtbIds: [] })),
  }),
}

let ClaudeCopyWriter: new (fb: unknown) => {
  draft: (req: unknown) => Promise<{ source?: string; reason?: string }>
}

beforeEach(async () => {
  ;({ ClaudeCopyWriter } = (await import('../../adapters/copy/draftWriter')) as never)
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

const reasonFor = async (status: number, body: unknown) => {
  globalThis.fetch = failWith(status, body) as never
  const out = await new ClaudeCopyWriter(fallback).draft({ campaign: 'C', icp: null, assets })
  return out
}

describe('what the writer says when the model cannot be used', () => {
  it('names running out of credits, and what to do about it', async () => {
    const out = await reasonFor(501, { error: 'NO_BUDGET' })
    expect(out.source).toBe('heuristic')
    expect(out.reason).toBe('Out of AI credits. Top up to generate with the model again.')
  })

  /** The other half of the same status, unchanged: a deployment with no key is a different problem. */
  it('still says nothing is connected when there is no key', async () => {
    const out = await reasonFor(501, { error: 'NO_KEY' })
    expect(out.source).toBe('heuristic')
    expect(out.reason).toBe('No AI model connected.')
  })

  /** A 501 carrying nothing readable is the no-key case, which is what it was before any of this. */
  it('falls back to the connection wording when the body says nothing', async () => {
    const out = await reasonFor(501, {})
    expect(out.reason).toBe('No AI model connected.')
  })

  /** And the statuses that were never about money keep their own sentences. */
  it('leaves the other failures alone', async () => {
    expect((await reasonFor(429, {})).reason).toBe('Too many requests. Wait a moment.')
    expect((await reasonFor(401, {})).reason).toBe('Your session expired. Sign in again.')
    expect((await reasonFor(504, {})).reason).toBe('The request timed out. Generate again.')
  })
})
