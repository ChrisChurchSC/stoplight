// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAgentAction } from '../agentBridge'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * THE SMALLEST UNIT GENERATION COULD BE ASKED FOR, and the one the connector could not ask for.
 *
 * generate_assets seeds a motion's deliverable set and APPENDS, so using it to redo one asset leaves
 * a second copy of everything; edit_asset only writes words the caller already has. The canvas has
 * had this on the inspector for a while — regenerateFlow([selPost.id]) — and nothing outside could
 * reach it.
 *
 * The order is the whole risk. draftCopy fills only EMPTY components, so a rewrite has to clear
 * first, and a refusal that arrives after the clear leaves the asset empty with an explanation
 * attached. FlowsView shipped exactly that bug once. These pin the order.
 */

let n = 0
const fresh = () => `Regen ${++n}`

async function asset(campaign: string, assetName: string): Promise<{ id: string; name: string }> {
  const r = (await runAgentAction('addAsset', {
    brand: 'Enid Blythe',
    campaign,
    channel: 'linkedin',
    assetName,
    primaryText: 'Original copy',
  })) as { result: { id: string; assetName: string } }
  return { id: r.result.id, name: r.result.assetName }
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('refusing before the wipe', () => {
  it('does not clear the copy when the campaign cannot generate', async () => {
    const campaign = fresh()
    const { id } = await asset(campaign, `${campaign} post`)
    vi.spyOn(useTrafficStore.getState(), 'copyBlockerFor').mockReturnValue('This campaign has no brand bound.')

    const res = await runAgentAction('regenerateAssets', { assets: [id] })
    expect(res.result).toBeUndefined()
    expect(res.error).toMatch(/no brand bound/i)
    expect(res.error).toMatch(/Nothing was changed/)

    // The point of the whole ordering: the copy is still there.
    const after = useTrafficStore.getState().rows.find((r) => r.id === id)!
    expect(Object.values(after.messaging ?? {}).join('')).toContain('Original copy')
  })
})

describe('what it refuses to touch', () => {
  it('skips a posted asset rather than rewriting what people already saw', async () => {
    const campaign = fresh()
    const { id } = await asset(campaign, `${campaign} live`)
    await runAgentAction('setAssetStatus', { assetId: id, status: 'posted' })

    const res = await runAgentAction('regenerateAssets', { assets: [id] })
    expect(res.result).toBeUndefined()
    expect(res.error).toMatch(/posted or failed/i)

    const after = useTrafficStore.getState().rows.find((r) => r.id === id)!
    expect(Object.values(after.messaging ?? {}).join('')).toContain('Original copy')
  })

  it('needs something to work on', async () => {
    const res = await runAgentAction('regenerateAssets', {})
    expect(res.error).toMatch(/assets.*or a.*campaign/i)
  })

  it('names an asset it cannot find rather than quietly rewriting none', async () => {
    const res = await runAgentAction('regenerateAssets', { assets: ['no such asset'] })
    expect(res.error).toMatch(/No asset/i)
  })
})

describe('reporting what actually happened', () => {
  /**
   * draftCopy returns WHO WROTE, not whether anything was written — null means no writer ran. A
   * caller that reported success on that would be claiming a rewrite for an asset it had just
   * emptied, which is the failure the store's own comment warns about.
   */
  it('says the assets are empty when no writer ran', async () => {
    const campaign = fresh()
    const { id } = await asset(campaign, `${campaign} post`)
    vi.spyOn(useTrafficStore.getState(), 'copyBlockerFor').mockReturnValue(null)
    vi.spyOn(useTrafficStore.getState(), 'draftCopy').mockResolvedValue(null)

    const res = (await runAgentAction('regenerateAssets', { assets: [id] })) as {
      result: { writer: string | null; note: string; rewritten: number }
    }
    expect(res.result.writer).toBeNull()
    expect(res.result.rewritten).toBe(1)
    expect(res.result.note).toMatch(/now EMPTY/)
  })
})
