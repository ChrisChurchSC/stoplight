// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { runAgentAction } from '../agentBridge'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * WRITING A DATE THROUGH THE TOOL LAYER, AND READING BACK WHAT YOU WROTE.
 *
 * The model has always carried scheduledAt and the store has always accepted it on create; what was
 * missing was every route to it from outside, which is why a month of authored assets stacked onto
 * the day they were authored. These cover the round trip rather than the fields: a write nothing can
 * read back is indistinguishable from no write at all.
 */

const BRAND = 'Enid Blythe'
let n = 0
const fresh = () => `Write ${++n}`

const row = (id: string) => useTrafficStore.getState().rows.find((r) => r.id === id)!
const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function add(campaign: string, assetName: string, extra: Record<string, unknown> = {}) {
  const r = (await runAgentAction('addAsset', {
    brand: BRAND,
    campaign,
    channel: 'linkedin',
    assetName,
    primaryText: 'Copy',
    ...extra,
  })) as { result?: { id: string }; error?: string }
  return r
}

async function listed(campaign: string) {
  const r = (await runAgentAction('listAssets', { brand: BRAND, campaign })) as {
    result: { assets: { id: string; assetName: string; scheduledAt: string; publishedAt: string; linksTo: string }[] }
  }
  return r.result.assets
}

beforeEach(() => {
  localStorage.clear()
})

describe('create with a date, read it back', () => {
  it('stores the date given at creation instead of the moment of creation', async () => {
    const c = fresh()
    const r = await add(c, `${c} post`, { scheduledAt: '2026-09-03T09:00:00Z' })
    expect(r.error).toBeUndefined()

    const [asset] = await listed(c)
    expect(asset.scheduledAt).toBe('2026-09-03T09:00:00.000Z')
  })

  it('returns scheduledAt from list_assets alongside publishedAt', async () => {
    const c = fresh()
    await add(c, `${c} post`, { scheduledAt: '2026-09-03T09:00:00Z' })

    const [asset] = await listed(c)
    expect(asset).toHaveProperty('scheduledAt')
    expect(asset).toHaveProperty('publishedAt')
  })
})

describe('edit the date, read back the new value', () => {
  it('moves the date and reports it', async () => {
    const c = fresh()
    const r = await add(c, `${c} post`, { scheduledAt: '2026-09-03T09:00:00Z' })
    const id = r.result!.id

    const edit = (await runAgentAction('editAsset', { assetId: id, scheduledAt: '2026-10-14T16:30:00Z' })) as {
      result: { scheduledAt: string }
    }
    expect(edit.result.scheduledAt).toBe('2026-10-14T16:30:00.000Z')
    expect((await listed(c))[0].scheduledAt).toBe('2026-10-14T16:30:00.000Z')
  })

  it('clears the date with null, and the asset falls back to when it was made', async () => {
    const c = fresh()
    const id = (await add(c, `${c} post`, { scheduledAt: '2026-09-03T09:00:00Z' })).result!.id

    await runAgentAction('editAsset', { assetId: id, scheduledAt: null })

    expect(row(id).scheduledAt).toBe('')
    // Not dropped from the workspace: a cleared date sorts by createdAt rather than vanishing.
    expect((await listed(c)).map((x) => x.id)).toContain(id)
  })

  it('keeps a flighted asset the same length when its start moves', async () => {
    const c = fresh()
    const id = (await add(c, `${c} always-on`, { scheduledAt: '2026-09-03T09:00:00Z' })).result!.id
    await useTrafficStore.getState().updateRow(id, { endsAt: '2026-09-17T09:00:00.000Z' })
    const length = Date.parse(row(id).endsAt!) - Date.parse(row(id).scheduledAt)

    await runAgentAction('editAsset', { assetId: id, scheduledAt: '2026-10-14T09:00:00Z' })

    expect(Date.parse(row(id).endsAt!) - Date.parse(row(id).scheduledAt)).toBe(length)
  })
})

describe('renaming, which the journey is addressed by', () => {
  it('rewrites every link pointing at the old name', async () => {
    const c = fresh()
    const from = (await add(c, `${c} ad`)).result!.id
    const to = (await add(c, `${c} landing`)).result!.id
    await runAgentAction('linkAssets', { from: `${c} ad`, to: `${c} landing`, as: 'next' })
    expect(row(from).linksTo).toBe(`${c} landing`)

    const res = await runAgentAction('editAsset', { assetId: to, assetName: `${c} landing page v2` })
    expect(res.error).toBeUndefined()

    // The edge still points at a real asset, which is the whole point.
    expect(row(to).assetName).toBe(`${c} landing page v2`)
    expect(row(from).linksTo).toBe(`${c} landing page v2`)
  })

  it('rewrites branchOf too, not only linksTo', async () => {
    const c = fresh()
    const parent = (await add(c, `${c} parent`)).result!.id
    const child = (await add(c, `${c} child`)).result!.id
    await runAgentAction('linkAssets', { from: `${c} parent`, to: `${c} child`, as: 'branch' })
    expect(row(child).branchOf).toBe(`${c} parent`)

    await runAgentAction('editAsset', { assetId: parent, assetName: `${c} parent renamed` })

    expect(row(child).branchOf).toBe(`${c} parent renamed`)
  })

  it('refuses a name another asset already uses, rather than making links ambiguous', async () => {
    const c = fresh()
    const a = (await add(c, `${c} one`)).result!.id
    await add(c, `${c} two`)

    const res = await runAgentAction('editAsset', { assetId: a, assetName: `${c} two` })
    expect(res.error).toMatch(/already called/i)
    expect(res.error).toMatch(/BY NAME/)
    expect(row(a).assetName).toBe(`${c} one`)
  })
})

describe('the calendar the dates are for', () => {
  it('groups authored assets by scheduledAt when they have no publishedAt', async () => {
    const c = fresh()
    await add(c, `${c} sept`, { scheduledAt: '2026-09-03T09:00:00Z' })
    await add(c, `${c} oct`, { scheduledAt: '2026-10-14T09:00:00Z' })

    const canvas = (await runAgentAction('createCanvas', {
      brand: BRAND,
      name: `${c} calendar`,
      filter: { campaign: c },
      layout: 'calendar',
      groupBy: 'date',
    })) as { result: { id: string } }
    const opened = (await runAgentAction('getCanvas', { id: canvas.result.id })) as {
      result: { groups: { key: string; count: number }[] }
    }

    // Groups are YYYY-MM, keyed off assetDate (publishedAt, else scheduledAt).
    const keys = opened.result.groups.map((g) => g.key).sort()
    expect(keys).toEqual(['2026-09', '2026-10'])
  })

  it('returns the right window for publishedAfter / publishedBefore', async () => {
    const c = fresh()
    await add(c, `${c} early`, { scheduledAt: '2026-09-03T09:00:00Z' })
    await add(c, `${c} mid`, { scheduledAt: '2026-10-14T09:00:00Z' })
    await add(c, `${c} late`, { scheduledAt: '2026-12-01T09:00:00Z' })

    const r = (await runAgentAction('listAssets', {
      brand: BRAND,
      campaign: c,
      publishedAfter: '2026-10-01T00:00:00Z',
      publishedBefore: '2026-11-01T00:00:00Z',
    })) as { result: { assets: { assetName: string }[] } }

    expect(r.result.assets.map((x) => x.assetName)).toEqual([`${c} mid`])
  })
})

describe('intent and fact are different claims', () => {
  it('does not clear scheduledAt when publishedAt is set', async () => {
    const c = fresh()
    const id = (await add(c, `${c} post`, { scheduledAt: '2026-09-03T09:00:00Z' })).result!.id

    await useTrafficStore.getState().updateRow(id, { publishedAt: '2026-09-04T11:15:00.000Z' })

    // The gap between planned and actual is the useful part; collapsing it loses the slip.
    expect(row(id).scheduledAt).toBe('2026-09-03T09:00:00.000Z')
    expect(row(id).publishedAt).toBe('2026-09-04T11:15:00.000Z')
    const [asset] = await listed(c)
    expect(asset.scheduledAt).toBe('2026-09-03T09:00:00.000Z')
    expect(asset.publishedAt).toBe('2026-09-04T11:15:00.000Z')
  })

  it('filters by publishedAt in preference to scheduledAt', async () => {
    const c = fresh()
    const id = (await add(c, `${c} slipped`, { scheduledAt: '2026-09-03T09:00:00Z' })).result!.id
    await useTrafficStore.getState().updateRow(id, { publishedAt: '2026-12-20T09:00:00.000Z' })

    // Planned for September, actually out in December: the December window is the one it answers.
    const sept = (await runAgentAction('listAssets', {
      brand: BRAND, campaign: c, publishedAfter: '2026-09-01T00:00:00Z', publishedBefore: '2026-09-30T00:00:00Z',
    })) as { result: { assets: unknown[] } }
    const dec = (await runAgentAction('listAssets', {
      brand: BRAND, campaign: c, publishedAfter: '2026-12-01T00:00:00Z', publishedBefore: '2026-12-31T00:00:00Z',
    })) as { result: { assets: unknown[] } }

    expect(sept.result.assets).toHaveLength(0)
    expect(dec.result.assets).toHaveLength(1)
  })
})

describe('errors that used to be notes', () => {
  it('refuses an unparseable date instead of falling back to now', async () => {
    const c = fresh()
    const id = (await add(c, `${c} post`, { scheduledAt: '2026-09-03T09:00:00Z' })).result!.id

    const res = await runAgentAction('editAsset', { assetId: id, scheduledAt: 'next tuesday' })
    expect(res.error).toMatch(/not a date I can read/)
    expect(row(id).scheduledAt).toBe('2026-09-03T09:00:00.000Z')
  })

  it('refuses an unparseable date at creation, writing nothing', async () => {
    const c = fresh()
    const res = await add(c, `${c} post`, { scheduledAt: 'soon' })
    expect(res.error).toMatch(/not a date I can read/)
    expect(await listed(c)).toHaveLength(0)
  })

  it('errors on copy the format cannot store, rather than noting it inside a success', async () => {
    const c = fresh()
    const id = (await add(c, `${c} post`)).result!.id
    const before = JSON.stringify(row(id).messaging)

    // The ALIAS path, which is where copy used to go missing quietly: an unknown key in `fields`
    // already threw, but a shorthand the format has no component for came back as `notStored`
    // inside a 200. A LinkedIn post renders body / cta / in-creative-copy — no description.
    const res = await runAgentAction('editAsset', { assetId: id, description: 'Nowhere to go' })
    expect(res.result).toBeUndefined()
    expect(res.error).toMatch(/no field for: description/)
    expect(res.error).toMatch(/NOTHING was written/)
    expect(JSON.stringify(row(id).messaging)).toBe(before)
  })
})

describe('a status that claims a moment needs one', () => {
  it('refuses `scheduled` when the asset has no date', async () => {
    const c = fresh()
    const id = (await add(c, `${c} post`)).result!.id
    await runAgentAction('editAsset', { assetId: id, scheduledAt: null })

    const res = await runAgentAction('setAssetStatus', { assetId: id, status: 'scheduled' })
    expect(res.error).toMatch(/cannot be marked scheduled/)
    expect(row(id).status).not.toBe('scheduled')
  })

  it('allows `scheduled` once a date is set', async () => {
    const c = fresh()
    const id = (await add(c, `${c} post`, { scheduledAt: '2026-09-03T09:00:00Z' })).result!.id

    const res = await runAgentAction('setAssetStatus', { assetId: id, status: 'scheduled' })
    expect(res.error).toBeUndefined()
    expect(row(id).status).toBe('scheduled')
  })

  it('leaves every other status alone', async () => {
    const c = fresh()
    const id = (await add(c, `${c} post`)).result!.id
    await runAgentAction('editAsset', { assetId: id, scheduledAt: null })

    const res = await runAgentAction('setAssetStatus', { assetId: id, status: 'approved' })
    expect(res.error).toBeUndefined()
    expect(row(id).status).toBe('approved')
  })
})

describe('the batch, where one bad item must not sink the rest', () => {
  it('writes every good item and names the failures', async () => {
    const c = fresh()
    const a = (await add(c, `${c} a`, { scheduledAt: '2026-09-03T09:00:00Z' })).result!.id
    const b = (await add(c, `${c} b`, { scheduledAt: '2026-09-03T09:00:00Z' })).result!.id

    const res = (await runAgentAction('setSchedule', {
      items: [
        { assetId: a, scheduledAt: '2026-10-01T09:00:00Z' },
        { assetId: 'row_nope', scheduledAt: '2026-10-02T09:00:00Z' },
        { assetId: b, scheduledAt: 'the fifth of never' },
      ],
    })) as { result: { requested: number; scheduled: number; failed: number; results: { ok: boolean; error?: string }[] } }

    expect(res.result.requested).toBe(3)
    expect(res.result.scheduled).toBe(1)
    expect(res.result.failed).toBe(2)
    expect(localDay(row(a).scheduledAt)).toBe(localDay('2026-10-01T09:00:00Z'))
    // The one with the bad date is untouched, not blanked.
    expect(row(b).scheduledAt).toBe('2026-09-03T09:00:00.000Z')
    expect(res.result.results[1].error).toMatch(/asset not found/)
    expect(res.result.results[2].error).toMatch(/not a date I can read/)
  })

  it('sets sixteen different dates in one call', async () => {
    const c = fresh()
    const ids: string[] = []
    for (let i = 0; i < 16; i++) ids.push((await add(c, `${c} ${i}`)).result!.id)

    const res = (await runAgentAction('setSchedule', {
      items: ids.map((assetId, i) => ({ assetId, scheduledAt: `2026-09-${String(i + 1).padStart(2, '0')}T09:00` })),
    })) as { result: { scheduled: number; failed: number } }

    expect(res.result.scheduled).toBe(16)
    expect(res.result.failed).toBe(0)
    expect(localDay(row(ids[0]).scheduledAt)).toBe('2026-09-01')
    expect(localDay(row(ids[15]).scheduledAt)).toBe('2026-09-16')
  })

  it('clears a date with null, per item', async () => {
    const c = fresh()
    const id = (await add(c, `${c} a`, { scheduledAt: '2026-09-03T09:00:00Z' })).result!.id

    await runAgentAction('setSchedule', { items: [{ assetId: id, scheduledAt: null }] })

    expect(row(id).scheduledAt).toBe('')
  })

  it('refuses to rewrite when a posted asset actually went out', async () => {
    const c = fresh()
    const id = (await add(c, `${c} live`, { scheduledAt: '2026-09-03T09:00:00Z' })).result!.id
    await runAgentAction('setAssetStatus', { assetId: id, status: 'posted' })

    const res = (await runAgentAction('setSchedule', {
      items: [{ assetId: id, scheduledAt: '2026-10-01T09:00:00Z' }],
    })) as { result: { scheduled: number; results: { error?: string }[] } }

    expect(res.result.scheduled).toBe(0)
    expect(res.result.results[0].error).toMatch(/already posted/)
    expect(row(id).scheduledAt).toBe('2026-09-03T09:00:00.000Z')
  })

  it('needs items at all', async () => {
    const res = await runAgentAction('setSchedule', { items: [] })
    expect(res.error).toMatch(/items is required/)
  })
})
