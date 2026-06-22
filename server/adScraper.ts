import { chromium, type Page } from 'playwright'

/**
 * Best-effort live-ad scraper for "Set up with Claude". Loads the PUBLIC ad
 * libraries in a headless browser and dumps the rendered ad text, which Claude
 * then parses into the proposed workspace. This is the only no-third-party way to
 * read a brand's currently-running ads, and it is genuinely brittle: Meta runs an
 * anti-bot challenge (we get a 403 on a plain fetch) and both sites change markup
 * often. So every step is wrapped, and we return whatever we got (possibly
 * nothing) rather than failing the setup. Dev/server only.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** True if a rendered text dump looks like real ad results, not a challenge /
 *  empty state. Guards against returning the anti-bot page as "ad copy". */
function looksLikeResults(text: string, markers: RegExp): boolean {
  return text.length > 800 && markers.test(text)
}

async function scrapeMeta(page: Page, query: string): Promise<string> {
  const url =
    `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US` +
    `&q=${encodeURIComponent(query)}&search_type=keyword_unordered&media_type=all`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  // Ads render client-side after the search resolves; give it room, then settle.
  await page.waitForTimeout(7000)
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  const text = await page.innerText('body').catch(() => '')
  // Real ad cards carry "Library ID" + "Started running on"; the challenge page
  // and the empty state do not. Require both to avoid returning chrome as "ads".
  if (!looksLikeResults(text, /library id/i) || !/started running on/i.test(text)) return ''
  return text.replace(/\s+/g, ' ').trim().slice(0, 6000)
}

// Google Ads Transparency is intentionally NOT scraped here. Its `?query=` URL
// lands on the generic homepage rather than running a search, so it needs a
// separate advertiser-ID lookup + internal RPC flow. Left as a follow-on so we
// never feed Claude the landing page as if it were ad copy.

/** Pull a brand's currently-running ads from Meta + Google ad libraries.
 *  Returns the rendered ad text (for Claude to parse) and which sources hit. */
export async function readLiveAds(query: string): Promise<{ text: string; sources: string[] }> {
  const q = query.trim()
  if (!q) return { text: '', sources: [] }

  let browser
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    })
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'en-US' })
    // Make automation a little less obvious to the anti-bot checks. Passed as a
    // string so it is evaluated in the browser (not typechecked in Node).
    await ctx.addInitScript("Object.defineProperty(navigator, 'webdriver', { get: () => undefined })")
    const page = await ctx.newPage()

    const blocks: string[] = []
    const sources: string[] = []
    const meta = await scrapeMeta(page, q).catch(() => '')
    if (meta) {
      blocks.push(`## Meta Ad Library (rendered)\n${meta}`)
      sources.push('Meta Ad Library')
    }
    return { text: blocks.join('\n\n').slice(0, 9000), sources }
  } catch {
    return { text: '', sources: [] }
  } finally {
    await browser?.close().catch(() => {})
  }
}
