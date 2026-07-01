import Anthropic from '@anthropic-ai/sdk'
import { NoKeyError } from './siteMapHandler'

/**
 * Ingest a brand's LIVE Google Ads copy via the Google Ads API. Exchanges a
 * stored OAuth refresh token for an access token, runs a GAQL query for the ad
 * text (Responsive Search/Display + Expanded Text headlines and descriptions),
 * and has Claude map it into the paid Google channels. Read-only. Dev/server
 * only; NO_KEY (501) when ANTHROPIC_API_KEY is unset, GOOGLE_ADS_ERROR when the
 * token exchange or the Ads query fails.
 *
 * Prereqs the caller supplies (per client): an approved developer token, an OAuth
 * client id/secret, a refresh token (one-time consent), and the customer id.
 */

const ADS_VERSION = 'v18'

export interface GoogleAdsMessage {
  label: string
  headline: string
  body?: string
  cta?: string
  type: string
  audience: string
  /** Paid Google surface this ad belongs to. */
  channel?: string
  source?: string
}
export interface GoogleAdsIngestResult {
  voice?: string
  proofPoints: { label: string; detail: string }[]
  messages: GoogleAdsMessage[]
  adsRead: number
}

class GoogleAdsError extends Error {
  code = 'GOOGLE_ADS_ERROR'
}

interface AdsCreds {
  developerToken: string
  clientId: string
  clientSecret: string
  refreshToken: string
  customerId: string
  loginCustomerId?: string
}

/** Refresh-token grant -> access token. */
async function accessToken(creds: AdsCreds): Promise<string> {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  })
  let res: Response
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    throw new GoogleAdsError('Could not reach Google OAuth.')
  }
  if (!res.ok) throw new GoogleAdsError('OAuth token exchange failed. Check the client id, secret, and refresh token.')
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new GoogleAdsError('Google did not return an access token.')
  return json.access_token
}

const GAQL = `SELECT
  campaign.name,
  ad_group.name,
  ad_group_ad.ad.type,
  ad_group_ad.ad.name,
  ad_group_ad.ad.responsive_search_ad.headlines,
  ad_group_ad.ad.responsive_search_ad.descriptions,
  ad_group_ad.ad.expanded_text_ad.headline_part1,
  ad_group_ad.ad.expanded_text_ad.headline_part2,
  ad_group_ad.ad.expanded_text_ad.description,
  ad_group_ad.ad.responsive_display_ad.long_headline,
  ad_group_ad.ad.responsive_display_ad.headlines,
  ad_group_ad.ad.responsive_display_ad.descriptions
FROM ad_group_ad
WHERE ad_group_ad.status != 'REMOVED'
LIMIT 200`

interface TextAsset {
  text?: string
}
interface AdResult {
  campaign?: { name?: string }
  adGroup?: { name?: string }
  adGroupAd?: {
    ad?: {
      type?: string
      name?: string
      responsiveSearchAd?: { headlines?: TextAsset[]; descriptions?: TextAsset[] }
      expandedTextAd?: { headlinePart1?: string; headlinePart2?: string; description?: string }
      responsiveDisplayAd?: { longHeadline?: TextAsset; headlines?: TextAsset[]; descriptions?: TextAsset[] }
    }
  }
}

// Ad type -> paid Google channel.
function channelForAdType(type: string | undefined): string {
  const t = (type ?? '').toUpperCase()
  if (t.includes('DISPLAY')) return 'google-demand'
  if (t.includes('DISCOVERY') || t.includes('DEMAND')) return 'google-demand'
  return 'google-search'
}

/** Flatten one ad result to its headlines, descriptions, and channel. */
function adCopy(r: AdResult): { channel: string; headlines: string[]; descriptions: string[]; context: string } | null {
  const ad = r.adGroupAd?.ad
  if (!ad) return null
  const headlines: string[] = []
  const descriptions: string[] = []
  if (ad.responsiveSearchAd) {
    headlines.push(...(ad.responsiveSearchAd.headlines ?? []).map((h) => h.text ?? '').filter(Boolean))
    descriptions.push(...(ad.responsiveSearchAd.descriptions ?? []).map((d) => d.text ?? '').filter(Boolean))
  }
  if (ad.expandedTextAd) {
    headlines.push(...[ad.expandedTextAd.headlinePart1, ad.expandedTextAd.headlinePart2].filter((x): x is string => !!x))
    if (ad.expandedTextAd.description) descriptions.push(ad.expandedTextAd.description)
  }
  if (ad.responsiveDisplayAd) {
    if (ad.responsiveDisplayAd.longHeadline?.text) headlines.push(ad.responsiveDisplayAd.longHeadline.text)
    headlines.push(...(ad.responsiveDisplayAd.headlines ?? []).map((h) => h.text ?? '').filter(Boolean))
    descriptions.push(...(ad.responsiveDisplayAd.descriptions ?? []).map((d) => d.text ?? '').filter(Boolean))
  }
  if (!headlines.length && !descriptions.length) return null
  const context = [r.campaign?.name, r.adGroup?.name].filter(Boolean).join(' / ')
  return { channel: channelForAdType(ad.type), headlines, descriptions, context }
}

async function fetchAds(creds: AdsCreds, token: string): Promise<ReturnType<typeof adCopy>[]> {
  const cid = creds.customerId.replace(/[^0-9]/g, '')
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': creds.developerToken,
    'content-type': 'application/json',
  }
  if (creds.loginCustomerId) headers['login-customer-id'] = creds.loginCustomerId.replace(/[^0-9]/g, '')

  let res: Response
  try {
    res = await fetch(`https://googleads.googleapis.com/${ADS_VERSION}/customers/${cid}/googleAds:searchStream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: GAQL }),
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new GoogleAdsError('Could not reach the Google Ads API.')
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const msg = /developer token/i.test(detail)
      ? 'The developer token is not approved or is invalid.'
      : /customer/i.test(detail) && res.status === 403
        ? 'No access to that customer id (check login-customer-id / account access).'
        : `Google Ads query failed (${res.status}).`
    throw new GoogleAdsError(msg)
  }
  // searchStream returns an array of batches, each with a results[] array.
  const batches = (await res.json()) as { results?: AdResult[] }[]
  const out: ReturnType<typeof adCopy>[] = []
  for (const b of batches) for (const r of b.results ?? []) out.push(adCopy(r))
  return out.filter(Boolean)
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    voice: { type: 'string' },
    proofPoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { label: { type: 'string' }, detail: { type: 'string' } },
        required: ['label', 'detail'],
      },
    },
    messages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          headline: { type: 'string' },
          body: { type: 'string' },
          cta: { type: 'string' },
          type: { type: 'string', enum: ['headline', 'value-prop', 'claim', 'cta', 'offer', 'proof', 'post'] },
          audience: { type: 'string' },
          channel: { type: 'string', enum: ['google-search', 'google-demand', 'pmax'] },
          source: { type: 'string' },
        },
        required: ['label', 'headline', 'type', 'audience'],
      },
    },
  },
  required: ['messages'],
} as const

const SYSTEM = `You are mapping a brand's LIVE Google Ads messaging for an agency onboarding them. You are given their running ad copy — each block is one ad with its campaign/ad group, its headlines, and its descriptions.

Extract their live paid-search messaging:
- messages: every distinct value prop, claim, offer, headline, or CTA worth mapping. For each give a short label, the headline (the actual line), optional body and cta, its type, the audience it speaks to, the channel (google-search for search ads, google-demand for display/demand-gen), and a source note (the campaign name).
- proofPoints: their real reasons-to-believe (label + one-line detail), quoted from the ad copy.
- voice: a one-to-two sentence read on how their ad copy reads.

Ground everything in the provided copy and quote their real words. Do not invent ads they are not running. Do not use em dashes. Return ONLY the structured object.`

type Progress = (e: { stage: string; detail: string }) => void

export async function runGoogleAdsIngest(body: unknown, onProgress?: Progress): Promise<GoogleAdsIngestResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const creds = (body ?? {}) as Partial<AdsCreds>
  for (const k of ['developerToken', 'clientId', 'clientSecret', 'refreshToken', 'customerId'] as const) {
    if (!creds[k]?.trim()) throw new GoogleAdsError(`Missing ${k}.`)
  }
  const full = creds as AdsCreds

  onProgress?.({ stage: 'auth', detail: 'Authorizing with Google' })
  const token = await accessToken(full)
  onProgress?.({ stage: 'reading', detail: `Querying Google Ads account ${full.customerId}` })
  const ads = await fetchAds(full, token)
  onProgress?.({ stage: 'ads', detail: ads.length ? `Read ${ads.length} live ads` : 'No live ads found' })
  if (!ads.length) return { voice: undefined, proofPoints: [], messages: [], adsRead: 0 }

  onProgress?.({ stage: 'extracting', detail: 'Mapping the ad messaging' })
  const corpus = ads
    .map((a) => `[${channelHint(a!.channel)} | ${a!.context}]\nHeadlines: ${a!.headlines.join(' | ')}\nDescriptions: ${a!.descriptions.join(' | ')}`)
    .join('\n\n')
    .slice(0, 24000)

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `Live Google Ads copy (${ads.length} ads):\n\n${corpus}\n\nMap their paid-search messaging.` }],
  })
  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const parsed = JSON.parse(block && block.type === 'text' ? block.text : '{}') as Partial<GoogleAdsIngestResult>

  onProgress?.({ stage: 'mapped', detail: `Mapped ${parsed.messages?.length ?? 0} messages from ${ads.length} ads` })
  return {
    voice: parsed.voice,
    proofPoints: parsed.proofPoints ?? [],
    messages: parsed.messages ?? [],
    adsRead: ads.length,
  }
}

const channelHint = (c: string): string => (c === 'google-demand' ? 'Demand Gen / Display' : 'Search')
