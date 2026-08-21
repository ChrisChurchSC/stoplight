import { GTM_STRATEGIES, inferStrategy } from '../../domain/strategies'
import type { Rtb } from '../../domain/rtb'
import type { ChannelId } from '../../domain/types'
import type { Icp } from '../icp/types'
import { apiFetch } from '../../lib/apiFetch'

/**
 * "Claude sets up the workspace": from a URL (+ optional notes), generate a
 * complete proposed workspace config — brand, ICP, proof, channel mix, and a
 * first campaign — for the user to confirm. Real generation runs server-side
 * (/api/setup, which can read the site); the heuristic fallback derives a
 * sensible starting point from the domain when there's no backend / key.
 * Mirrors the ICP-review + copy-draft seams.
 */
export interface WorkspaceSetup {
  brand: { name: string; website: string; industry: string; voice: string }
  icp: Icp
  rtbs: Rtb[]
  /** Channels this team actually uses (drives the taxonomy emphasis). */
  channelMix: ChannelId[]
  /** GTM strategy key for the first campaign — INFERRED from business-model signals. */
  strategy: string
  /** Optional secondary motion (motions combine, e.g. PLG core + demand-capture). */
  secondaryStrategy?: string
  /** Why this motion was recommended, so the user can see and trust the choice. */
  strategyRationale?: string
  /** Inference confidence: 'low' | 'medium' | 'high'. */
  strategyConfidence?: string
  /** The business-model signals the recommendation was grounded in. */
  signalsUsed?: string[]
  /** B2C / B2B / freemium / ad-supported, as inferred. */
  businessModel?: string
  campaign: { name: string; durationWeeks: number; monthlyVolume: number; overallBudget: number }
  /**
   * WHERE THIS CAME FROM, and the reason it is here at all.
   *
   * 'crawl' means the site was read. 'heuristic' means it was not — and every field below that a
   * crawl would have OBSERVED is empty, because the alternative is what this used to do: return a
   * template ICP, a template voice and three template proof points (one of them the literal string
   * "Add a real customer outcome here.") in exactly the shape a real crawl returns, with nothing
   * anywhere to tell the two apart. In production /api/setup is not registered, so the heuristic is
   * the only path that ever runs, and the fabrication was the entire product of onboarding.
   *
   * The same idiom the copy writer already uses — it returns source: 'claude' | 'heuristic' so
   * callers can badge it — rather than a new vocabulary for the same idea.
   */
  source: 'crawl' | 'heuristic'
  /** Why the crawl did not happen or was not believed. Present whenever source is 'heuristic'. */
  crawlReason?: string
  /**
   * What the motion profile WOULD have suggested, kept apart from the observed fields so it can be
   * offered as a starting point without being persisted as though somebody had checked it.
   */
  suggestedDefaults?: {
    industry: string
    voice: string
    icpName: string
    segment: string
    pains: string[]
    rtbs: Rtb[]
  }
}

/**
 * Titles a bot wall serves instead of a homepage. delete_client's own doc comment exists to clear
 * junk brands named "Just a moment..." — a Cloudflare interstitial — which means these have been
 * reaching the workspace as brand names. A crawl that returns one of these did not read the site.
 */
const INTERSTITIAL = /^\s*(just a moment|attention required|checking your browser|please wait|one moment|access denied|are you a robot|verify you are human|403 forbidden|security check)/i

export const looksLikeInterstitial = (name: string): boolean => INTERSTITIAL.test(name ?? '')

export interface SetupInput {
  url: string
  notes?: string
}

export interface SetupGenerator {
  generate(input: SetupInput): Promise<WorkspaceSetup>
}

export class ClaudeSetupGenerator implements SetupGenerator {
  constructor(private fallback: SetupGenerator) {}
  async generate(input: SetupInput): Promise<WorkspaceSetup> {
    /**
     * THE FALLBACK IS NOT SILENT ANY MORE.
     *
     * `catch { return this.fallback.generate(input) }` swallowed everything — a 404 from an
     * unregistered route, a timeout, a bot wall — and returned a fabricated profile in the shape of
     * an observed one. /api/setup is registered in devApiManifest and NOT in the production
     * manifest (it needs Playwright), so in every deployed environment this catch is the ONLY path
     * taken, and the reason was thrown away every time.
     */
    let reason = ''
    try {
      const res = await apiFetch('/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(res.status === 404 ? 'The site crawler is not available in this environment.' : `The crawler returned ${res.status}.`)
      const out = (await res.json()) as WorkspaceSetup
      if (!out?.brand?.name) throw new Error('The crawler returned nothing about this site.')
      // A bot wall is a failure wearing a brand name. Reading its title as the company is how a
      // workspace ends up with a client called "Just a moment...".
      if (looksLikeInterstitial(out.brand.name)) {
        throw new Error(`The site answered with a bot check ("${out.brand.name.trim()}"), so nothing was read.`)
      }
      return { ...out, source: 'crawl' }
    } catch (e) {
      reason = String((e as Error)?.message ?? e)
    }
    const fallback = await this.fallback.generate(input)
    return { ...fallback, crawlReason: reason }
  }
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function domainToBrand(url: string): { name: string; host: string } {
  const host = (url || '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim()
  const base = (host.split('.')[0] || 'yourcompany').replace(/[-_]/g, ' ')
  return { name: base.split(' ').map(cap).join(' ') || 'Your Company', host: host || 'yourcompany.com' }
}

/** A motion-aligned starting profile, so a fallback setup is internally consistent
 *  (a PLG brand is not described as a mid-market B2B SaaS). */
interface MotionProfile {
  industry: string
  voice: string
  businessModel: string
  icpName: string
  segment: string
  summary: string
  firmographics: { label: string; value: string }[]
  pains: string[]
  channelMix: ChannelId[]
}
const MOTION_PROFILES: Record<string, MotionProfile> = {
  plg: {
    industry: 'Software (self-serve)',
    voice: 'Plain, helpful, and fast. Show value in the first screen, skip the jargon.',
    businessModel: 'B2C / freemium (product-led)',
    icpName: 'Hands-on self-serve users',
    segment: 'Activated free users with upgrade intent',
    summary: 'people who sign up themselves, get value fast, and upgrade in-app when they hit a limit.',
    firmographics: [
      { label: 'Audience', value: 'Individual users / small teams' },
      { label: 'Adoption', value: 'Bottoms-up, self-serve' },
      { label: 'Buyer', value: 'The end user' },
      { label: 'Pricing', value: 'Free tier + paid upgrade' },
    ],
    pains: ['time-to-value', 'tool friction', 'doing it manually', 'cost of the next tier'],
    channelMix: ['meta-ads', 'youtube', 'blog', 'email', 'landing-page', 'instagram'],
  },
  'sales-led': {
    industry: 'B2B SaaS',
    voice: 'Clear, direct, and credible. Lead with proof, skip the hype.',
    businessModel: 'B2B (sales-assisted)',
    icpName: 'Mid-market operators',
    segment: 'Tier 1, best-fit accounts',
    summary: 'teams with a real budget and a considered buying process who need proof and a guided path.',
    firmographics: [
      { label: 'Industry', value: 'B2B SaaS' },
      { label: 'Company size', value: '200–2,000 employees' },
      { label: 'Buyer', value: 'VP / Director, with a buying committee' },
      { label: 'Motion', value: 'Sales-assisted, demo-led' },
    ],
    pains: ['fragmented stack', 'slow cycles', 'proof before purchase', 'change management'],
    channelMix: ['linkedin-ads', 'linkedin', 'google-search', 'email', 'blog', 'landing-page'],
  },
  abm: {
    industry: 'Enterprise B2B',
    voice: 'Authoritative and specific. Speak to the named account, not the market.',
    businessModel: 'B2B (enterprise / named accounts)',
    icpName: 'Enterprise buying committees',
    segment: 'Named target accounts',
    summary: 'a small set of high-value enterprise accounts with long cycles and multiple stakeholders.',
    firmographics: [
      { label: 'Industry', value: 'Enterprise' },
      { label: 'Company size', value: '2,000+ employees' },
      { label: 'Buyer', value: 'Multi-stakeholder committee' },
      { label: 'Deal size', value: 'High ACV' },
    ],
    pains: ['stakeholder alignment', 'risk / compliance', 'long procurement', 'integration scope'],
    channelMix: ['linkedin-ads', 'linkedin', 'email', 'landing-page', 'blog'],
  },
  community: {
    industry: 'Media / community',
    voice: 'Warm, in-the-know, and a little playful. Talk like a member, not a brand.',
    businessModel: 'B2C / audience-first',
    icpName: 'Engaged community members',
    segment: 'Active audience and contributors',
    summary: 'an audience that shows up for the content and the people, and spreads it by word of mouth.',
    firmographics: [
      { label: 'Audience', value: 'Enthusiasts / creators' },
      { label: 'Channel', value: 'Organic + community' },
      { label: 'Buyer', value: 'The community member' },
      { label: 'Spread', value: 'Word of mouth / referral' },
    ],
    pains: ['finding their people', 'signal vs noise', 'staying in the loop', 'getting recognized'],
    channelMix: ['instagram', 'youtube', 'tiktok', 'email', 'blog', 'x'],
  },
  'demand-gen': {
    industry: 'B2B SaaS',
    voice: 'Clear, direct, and credible. Lead with proof, skip the hype.',
    businessModel: 'B2B / SMB (demand capture)',
    icpName: 'Mid-market operators',
    segment: 'Tier 1, best-fit accounts',
    summary: 'teams drowning in manual, fragmented work who want fast time-to-value and proof over promises.',
    firmographics: [
      { label: 'Industry', value: 'B2B SaaS' },
      { label: 'Company size', value: '50–1,000 employees' },
      { label: 'Buyer', value: 'Head of Ops / Growth' },
      { label: 'Region', value: 'North America' },
    ],
    pains: ['manual workflows', 'slow tools', 'fragmented stack', 'time-to-value'],
  channelMix: ['google-search', 'meta-ads', 'linkedin', 'email', 'blog', 'landing-page'],
  },
}

/** Deterministic fallback — a real, editable starting point with no API key. Infers
 *  the GTM motion from the domain + any notes, then aligns the rest of the profile
 *  to that motion instead of a one-size B2B-SaaS default. */
export class HeuristicSetupGenerator implements SetupGenerator {
  async generate({ url, notes }: SetupInput): Promise<WorkspaceSetup> {
    const { name, host } = domainToBrand(url)
    const inf = inferStrategy(`${name} ${host} ${notes ?? ''}`)
    const p = MOTION_PROFILES[inf.strategy] ?? MOTION_PROFILES['demand-gen']
    const motionName = GTM_STRATEGIES.find((s) => s.key === inf.strategy)?.name ?? 'Demand Gen'
    /**
     * NOTHING HERE WAS OBSERVED, so nothing here is asserted.
     *
     * This used to return the motion profile's industry, voice, ICP name, segment, firmographics
     * and pains — plus three proof points, one of which was the literal placeholder "Add a real
     * customer outcome here." — in the identical shape a real crawl returns. setup_client then
     * reported them to the caller as findings about the brand, and provisionWorkspace persisted
     * them. On a domain nobody had read, an entire brand profile was invented and stored.
     *
     * What survives is only what genuinely derives from the input: the NAME and host from the
     * domain, and the strategy inference, which reports its own confidence honestly (inferStrategy
     * returns 'low' with an empty signal list when it has nothing to go on).
     *
     * The profile is still useful as a STARTING POINT, so it moves to suggestedDefaults where a
     * caller can offer it as a suggestion and a person can accept it. What it can no longer do is
     * arrive pre-accepted.
     */
    return {
      brand: { name, website: host, industry: '', voice: '' },
      icp: { name: '', segment: '', summary: '', firmographics: [], pains: [] },
      rtbs: [],
      suggestedDefaults: {
        industry: p.industry,
        voice: p.voice,
        icpName: p.icpName,
        segment: p.segment,
        pains: p.pains,
        rtbs: [
          { id: 'proof-1', label: 'Fast time-to-value', detail: 'Live in days, not quarters.' },
          { id: 'proof-2', label: 'Cuts manual work', detail: 'Automates the busywork teams hate.' },
        ],
      },
      source: 'heuristic',
      channelMix: p.channelMix,
      strategy: inf.strategy,
      secondaryStrategy: inf.secondaryStrategy,
      strategyRationale: inf.rationale,
      strategyConfidence: inf.confidence,
      signalsUsed: inf.signalsUsed,
      businessModel: p.businessModel,
      campaign: { name: `${name} — ${motionName}`, durationWeeks: 8, monthlyVolume: 30, overallBudget: 20000 },
    }
  }
}
