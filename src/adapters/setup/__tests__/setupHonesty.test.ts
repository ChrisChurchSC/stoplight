// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClaudeSetupGenerator, HeuristicSetupGenerator, looksLikeInterstitial } from '../setupGenerator'

/**
 * ONBOARDING USED TO INVENT THE BRAND IT CLAIMED TO HAVE READ.
 *
 * /api/setup is registered in devApiManifest and NOT in the production manifest — it needs
 * Playwright — so in every deployed environment the crawl 404s. ClaudeSetupGenerator's `catch`
 * swallowed that and returned HeuristicSetupGenerator's output, which was the GTM motion profile:
 * a template industry, a template voice, a template ICP with firmographics and pains, and three
 * proof points, one of them the literal string "Add a real customer outcome here." — all in exactly
 * the shape a real crawl returns, with nothing anywhere to tell them apart.
 *
 * setup_client reported them as findings about the brand and provisionWorkspace stored them. So
 * pointing it at a domain nobody had read produced a full, confident, entirely fabricated profile.
 *
 * These pin the two halves of the fix: what a failed crawl now returns, and that it says so.
 */

afterEach(() => vi.restoreAllMocks())

const heuristic = new HeuristicSetupGenerator()

describe('a crawl that did not happen', () => {
  it('asserts nothing it did not observe', async () => {
    const out = await heuristic.generate({ url: 'linear.app' })
    expect(out.source).toBe('heuristic')
    expect(out.brand.industry).toBe('')
    expect(out.brand.voice).toBe('')
    expect(out.icp.name).toBe('')
    expect(out.icp.pains).toEqual([])
    expect(out.rtbs).toEqual([])
  })

  it('still returns what genuinely derives from the input', async () => {
    const out = await heuristic.generate({ url: 'https://www.linear.app/pricing' })
    // The name and host come from the domain, which is a real derivation, not a guess.
    expect(out.brand.name).toBeTruthy()
    expect(out.brand.website).toBe('linear.app')
    // The motion inference reports its own confidence honestly, so it is allowed to stand.
    expect(out.strategy).toBeTruthy()
  })

  it('keeps the motion profile as a suggestion rather than a finding', async () => {
    const out = await heuristic.generate({ url: 'linear.app' })
    expect(out.suggestedDefaults?.industry).toBeTruthy()
    expect(out.suggestedDefaults?.icpName).toBeTruthy()
    // And the placeholder that used to ship as a proof point is gone entirely.
    const details = (out.suggestedDefaults?.rtbs ?? []).map((r) => r.detail).join(' ')
    expect(details).not.toMatch(/add a real customer outcome/i)
  })
})

describe('what the caller is told', () => {
  it('reports the reason when the crawler is not deployed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }))
    const out = await new ClaudeSetupGenerator(heuristic).generate({ url: 'linear.app' })
    expect(out.source).toBe('heuristic')
    expect(out.crawlReason).toMatch(/not available in this environment/i)
  })

  it('reports a crawler error rather than swallowing it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }))
    const out = await new ClaudeSetupGenerator(heuristic).generate({ url: 'linear.app' })
    expect(out.crawlReason).toMatch(/500/)
  })

  it('marks a real crawl as observed and leaves its fields alone', async () => {
    const crawled = {
      brand: { name: 'Linear', website: 'linear.app', industry: 'Dev tools', voice: 'Terse' },
      icp: { name: 'Engineering leads', segment: 'B2B', summary: 's', firmographics: [], pains: ['slow'] },
      rtbs: [{ id: 'r1', label: 'Real proof', detail: 'From the site' }],
      channelMix: [],
      strategy: 'plg',
      campaign: { name: 'c', durationWeeks: 8, monthlyVolume: 30, overallBudget: 1 },
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(crawled), { status: 200 }))
    const out = await new ClaudeSetupGenerator(heuristic).generate({ url: 'linear.app' })
    expect(out.source).toBe('crawl')
    expect(out.brand.industry).toBe('Dev tools')
    expect(out.rtbs).toHaveLength(1)
  })
})

describe('a bot wall is not a brand', () => {
  /**
   * delete_client's doc comment exists to clear junk brands named "Just a moment..." — a Cloudflare
   * interstitial. Which means a crawl was reading the bot-check page's title as the company name.
   */
  it('recognises the usual interstitial titles', () => {
    for (const t of ['Just a moment...', 'Attention Required! | Cloudflare', 'Checking your browser', '403 Forbidden']) {
      expect(looksLikeInterstitial(t), t).toBe(true)
    }
    expect(looksLikeInterstitial('Linear')).toBe(false)
  })

  it('treats an interstitial as a failed crawl, not as a company', async () => {
    const wall = {
      brand: { name: 'Just a moment...', website: 'x.com', industry: '', voice: '' },
      icp: { name: '', segment: '', summary: '', firmographics: [], pains: [] },
      rtbs: [],
      channelMix: [],
      strategy: 'demand-gen',
      campaign: { name: 'c', durationWeeks: 8, monthlyVolume: 30, overallBudget: 1 },
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(wall), { status: 200 }))
    const out = await new ClaudeSetupGenerator(heuristic).generate({ url: 'x.com' })
    expect(out.source).toBe('heuristic')
    expect(out.crawlReason).toMatch(/bot check/i)
    expect(out.brand.name).not.toMatch(/just a moment/i)
  })
})
