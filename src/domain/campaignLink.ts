/**
 * A LINK THAT NAMES A CAMPAIGN, so "I am working in this one" can be pasted rather than described.
 *
 * The address bar has always read `/`, whatever was open, so there was nothing to copy and no way to
 * say WHICH campaign to anything outside the app — least of all to a model, which otherwise has to
 * be told a name and trusted to have heard it right among fifteen brands and near-identical titles.
 *
 * KEYED BY NAME, NOT BY ID, and that is a deliberate limit rather than an oversight. Campaigns carry
 * no id: `campaignList`, `registerCampaign`, `linksTo`, `branchOf` and a flow board's own key are all
 * the name, so a link keyed on anything else would be the only thing in the app that was. The cost
 * is that renaming a campaign strands links already sent — acceptable because a stale one fails
 * loudly ("no campaign called X") rather than opening a different campaign quietly, and because a
 * link pasted into a conversation is usually minutes old.
 *
 * The BRAND rides along for the same reason a two-factor check exists: campaign names are unique
 * across the workspace only by convention, and a link that carries both can be confirmed to have
 * landed where it meant to instead of matching a title that happens to collide.
 */

export interface CampaignLink {
  brand?: string
  campaign: string
}

export const CAMPAIGN_PARAM = 'campaign'
export const BRAND_PARAM = 'brand'

/** The link for a campaign, against whatever origin the app is being served from. */
export function buildCampaignLink(origin: string, campaign: string, brand?: string): string {
  const url = new URL(origin || 'http://localhost')
  url.search = ''
  url.hash = ''
  url.searchParams.set(CAMPAIGN_PARAM, campaign)
  if (brand && brand.trim()) url.searchParams.set(BRAND_PARAM, brand.trim())
  return url.toString()
}

/**
 * Read a campaign out of something a person pasted, or null when it is not a link at all.
 *
 * Null is the useful half: every tool that takes a campaign takes a NAME, and a name is what most
 * callers pass. Answering null for those lets one resolver sit in front of all of them without
 * having to know which kind of string it was handed — a bare name falls straight through.
 *
 * Tolerant about the surroundings, because pasted links arrive wrapped in whatever the person
 * copied: angle brackets from an email client, a trailing full stop, markdown parentheses.
 */
export function readCampaignLink(value: string): CampaignLink | null {
  const raw = (value ?? '').trim().replace(/^[<([]+/, '').replace(/[>)\].,;]+$/, '')
  if (!raw || !/^https?:\/\//i.test(raw)) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const campaign = (url.searchParams.get(CAMPAIGN_PARAM) ?? '').trim()
  if (!campaign) return null
  const brand = (url.searchParams.get(BRAND_PARAM) ?? '').trim()
  return brand ? { campaign, brand } : { campaign }
}

/**
 * The campaign a caller meant, whether they passed a name or pasted a link. The one function every
 * tool can sit behind: a name is returned unchanged, so nothing that already worked changes.
 */
export function campaignFromInput(value: string): string {
  return readCampaignLink(value)?.campaign ?? (value ?? '').trim()
}
