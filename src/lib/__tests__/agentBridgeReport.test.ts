// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { runAgentAction } from '../agentBridge'
import { mockAttio } from '../../adapters/attio/mockAttio'
import { useTrafficStore } from '../../store/useTrafficStore'
import { DRAFTS_SPACE } from '../../domain/clients'

/**
 * THE REPORT AS THE CONNECTOR SERVES IT — the same rule the pure tests pin, asserted through the
 * layer that gathers the inputs. The gathering is where it could go wrong in a way report.ts cannot
 * see: a handler that passed the wrong sample flag would produce a perfectly honest report about a
 * dishonest input.
 */

const BRAND = 'Enid Blythe'
let n = 0
const fresh = () => `Report ${++n}`

async function add(campaign: string, assetName: string, extra: Record<string, unknown> = {}) {
  return (await runAgentAction('addAsset', {
    brand: BRAND,
    campaign,
    channel: 'linkedin',
    assetName,
    primaryText: 'Copy',
    ...extra,
  })) as { result?: { id: string }; error?: string }
}

const report = async (campaign: string) =>
  ((await runAgentAction('getCampaignReport', { campaign })) as {
    result: {
      brand: string | null
      campaign: string
      promise: { motion: string | null; unanswered: string[] }
      shipped: { total: number; live: number }
      measured: { assets: number; source: string }
      money: { shown: boolean; reason?: string }
      note: string
    }
    error?: string
  })

beforeEach(() => {
  localStorage.clear()
})

describe('the report the connector hands back', () => {
  it('withholds money while the workspace is on sample attribution', async () => {
    // The precondition this whole rule hangs on; if it ever stops being true the test says so.
    expect(mockAttio.isSample).toBe(true)

    const c = fresh()
    await add(c, `${c} post`, { scheduledAt: '2026-09-03T09:00:00Z' })

    const r = await report(c)
    expect(r.error).toBeUndefined()
    expect(r.result.money.shown).toBe(false)
    expect(r.result.money.reason).toMatch(/No CRM is connected/)
    // Not buried: the reply leads with why there is no money in it.
    expect(r.result.note).toMatch(/Money is not in this report/)
  })

  it('reports what shipped, and that nothing has been measured yet', async () => {
    const c = fresh()
    await add(c, `${c} one`)
    await add(c, `${c} two`)

    const r = await report(c)
    expect(r.result.brand).toBe(BRAND)
    expect(r.result.campaign).toBe(c)
    expect(r.result.shipped.total).toBe(2)
    expect(r.result.shipped.live).toBe(0)
    expect(r.result.measured.assets).toBe(0)
    expect(r.result.measured.source).toBe('none')
  })

  it('counts a posted asset as live', async () => {
    const c = fresh()
    const id = (await add(c, `${c} live`, { scheduledAt: '2026-09-03T09:00:00Z' })).result!.id
    await runAgentAction('setAssetStatus', { assetId: id, status: 'posted' })

    expect((await report(c)).result.shipped.live).toBe(1)
  })

  it('carries the motion through from the campaign record', async () => {
    const c = fresh()
    await add(c, `${c} post`)

    const r = await report(c)
    // addAsset creates the campaign with a default motion; the point is that it is REPORTED,
    // not that it has a particular value.
    expect(r.result.promise.motion).toBeTruthy()
  })

  it('does not head the report with Drafts for a campaign nobody owns', async () => {
    const c = fresh()
    // A blank-canvas campaign: it lives in the Drafts space and is filed under no brand. Created
    // through the store because new_campaign is the brand-scoped path and requires one.
    useTrafficStore.getState().addCampaign({ name: c, client: DRAFTS_SPACE, strategy: 'Demand Gen' })
    const r = await report(c)

    expect(r.error).toBeUndefined()
    // The two ways of being nobody's are not client names, and must not print as one.
    expect(r.result.brand).not.toBe('Drafts')
    expect(r.result.brand).not.toBe('Unassigned')
    expect(r.result.brand).toBeNull()
    expect(r.result.campaign).toBe(c)
  })

  it('refuses a campaign that does not exist rather than reporting an empty one', async () => {
    const r = await runAgentAction('getCampaignReport', { campaign: 'No Such Campaign' })
    expect(r.error).toMatch(/campaign not found/)
  })

  it('needs a campaign', async () => {
    const r = await runAgentAction('getCampaignReport', {})
    expect(r.error).toMatch(/campaign is required/)
  })
})
