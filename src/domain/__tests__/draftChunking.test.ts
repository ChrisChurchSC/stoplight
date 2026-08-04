import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * GENERATION IS CHUNKED, BECAUSE ONE REQUEST DOES NOT FIT.
 *
 * The endpoint writes every asset it is given in a single model call and the time scales with the
 * count. Measured against the real endpoint: 1 asset 12.4s, 3 assets 25.9s, 12 assets 64.8s. Every
 * function in this project is capped at 60 seconds (vercel.json), so a real campaign was killed by
 * the platform partway through and the client reported it as "the AI could not be reached".
 *
 * These pin the three things that make chunking safe rather than merely faster: the request count,
 * that one failing batch costs only its own assets, and that a partial run does not claim the model
 * wrote copy it did not write.
 */

const ORIGINAL_FETCH = globalThis.fetch

interface Body {
  assets?: { rowId: string }[]
}

/** A stub endpoint that answers per batch, so the test sees exactly what the writer sent. */
function stubEndpoint(behaviour: (batch: { rowId: string }[], call: number) => 'ok' | 'fail' | 'empty') {
  let call = 0
  return vi.fn(async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as Body
    const batch = body.assets ?? []
    const mode = behaviour(batch, call++)
    if (mode === 'fail') return { ok: false, status: 500, json: async () => ({}) }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        rtbs: [{ id: 'rtb1', label: 'Shared proof', detail: 'One pool across the campaign.' }],
        drafts: mode === 'empty' ? [] : batch.map((a) => ({ rowId: a.rowId, components: [], rtbIds: [] })),
      }),
    }
  })
}

const assets = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ rowId: `r${i + 1}`, assetName: `Post ${i + 1}`, channel: 'linkedin', fields: [] }))

/** The heuristic the writer falls back to, standing in for the real one. */
const fallback = {
  draft: async (req: { assets?: { rowId: string }[] }) => ({
    rtbs: [],
    drafts: (req.assets ?? []).map((a) => ({ rowId: a.rowId, components: [], rtbIds: [] })),
  }),
}

let ClaudeCopyWriter: new (fb: unknown) => { draft: (req: unknown) => Promise<{ drafts: { rowId: string }[]; rtbs: unknown[]; source?: string }> }

beforeEach(async () => {
  ;({ ClaudeCopyWriter } = (await import('../../adapters/copy/draftWriter')) as never)
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

const run = async (n: number, behaviour: Parameters<typeof stubEndpoint>[0]) => {
  const f = stubEndpoint(behaviour)
  globalThis.fetch = f as never
  const w = new ClaudeCopyWriter(fallback)
  const out = await w.draft({ campaign: 'C', icp: null, assets: assets(n) })
  return { out, calls: f.mock.calls.length, f }
}

describe('chunking the draft request', () => {
  it('sends one request when the set is small enough', async () => {
    const { out, calls } = await run(4, () => 'ok')
    expect(calls).toBe(1)
    expect(out.drafts).toHaveLength(4)
    expect(out.source).toBe('claude')
  })

  it('splits a full campaign into batches of four', async () => {
    const { out, calls } = await run(12, () => 'ok')
    expect(calls).toBe(3)
    expect(out.drafts).toHaveLength(12)
    expect(out.source).toBe('claude')
  })

  it('returns drafts in the order they were asked for', async () => {
    const { out } = await run(12, () => 'ok')
    expect(out.drafts.map((d) => d.rowId)).toEqual(assets(12).map((a) => a.rowId))
  })

  it('merges the proof pool by id rather than repeating it per batch', async () => {
    const { out } = await run(12, () => 'ok')
    expect(out.rtbs).toHaveLength(1)
  })

  /** The point of chunking: one bad request costs four assets, not the campaign. */
  it('falls back only for the batch that failed, keeping the rest', async () => {
    const { out } = await run(12, (_b, call) => (call === 1 ? 'fail' : 'ok'))
    expect(out.drafts).toHaveLength(12)
  })

  it('does not claim the model wrote a set where a batch fell back', async () => {
    const { out } = await run(12, (_b, call) => (call === 1 ? 'fail' : 'ok'))
    expect(out.source).toBe('heuristic')
  })

  /** A 200 carrying no drafts is a failure too, and used to be reported as unreachable. */
  it('treats an empty drafts array as a failed batch', async () => {
    const { out } = await run(12, (_b, call) => (call === 0 ? 'empty' : 'ok'))
    expect(out.drafts).toHaveLength(12)
    expect(out.source).toBe('heuristic')
  })

  it('falls back for everything when every batch fails', async () => {
    const { out } = await run(12, () => 'fail')
    expect(out.drafts).toHaveLength(12)
    expect(out.source).toBe('heuristic')
  })
})

/**
 * A FALLBACK SAYS WHY.
 *
 * The catch was bare, so a missing key, an expired session, a spend cap and a function timeout all
 * reached the user as one sentence about the AI being unreachable, and the evidence that told them
 * apart was thrown away at the point it was caught. These pin that each distinct status arrives as
 * its own reason, because the advice that follows differs: retrying is worth doing after a timeout
 * and pointless while signed out.
 */
describe('why the offline writer ran', () => {
  const withStatus = async (status: number, body: unknown = {}) => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status, json: async () => body })) as never
    const w = new ClaudeCopyWriter(fallback)
    return (await w.draft({ campaign: 'C', icp: null, assets: assets(1) })) as { source?: string; reason?: string }
  }

  it('names an expired session rather than an unreachable AI', async () => {
    expect((await withStatus(401)).reason).toBe('Your session expired. Sign in again.')
  })

  it('names a missing key or spent budget on a 501', async () => {
    expect((await withStatus(501)).reason).toBe('No AI model connected.')
  })

  it('names the rate limit on a 429', async () => {
    expect((await withStatus(429)).reason).toBe('Too many requests. Wait a moment.')
  })

  it('names a timeout on a gateway status, which is how a killed function arrives', async () => {
    expect((await withStatus(504)).reason).toBe('The request timed out. Generate again.')
  })

  it("passes the server's own error through when the status alone says nothing", async () => {
    const out = await withStatus(500, { error: 'NO_BUDGET' })
    expect(out.reason).toContain('NO_BUDGET')
  })

  it('distinguishes a served request that carried no copy', async () => {
    const { out } = await run(1, () => 'empty')
    expect(out.source).toBe('heuristic')
    expect((out as { reason?: string }).reason).toMatch(/no copy/i)
  })

  it('reads as a finished sentence, since the notice prints it verbatim', async () => {
    for (const status of [401, 501, 429, 504]) {
      const r = (await withStatus(status)).reason ?? ''
      expect(r[0]).toBe(r[0].toUpperCase())
      expect(r.endsWith('.')).toBe(true)
    }
  })

  it('says nothing when the model wrote it', async () => {
    const { out } = await run(4, () => 'ok')
    expect((out as { reason?: string }).reason).toBeUndefined()
  })

  it('reports one reason for a campaign whose batches failed together', async () => {
    const { out } = await run(12, () => 'fail')
    expect(typeof (out as { reason?: string }).reason).toBe('string')
  })
})
