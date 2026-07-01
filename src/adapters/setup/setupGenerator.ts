import { GTM_STRATEGIES, inferStrategy } from '../../domain/strategies'
import type { Rtb } from '../../domain/rtb'
import type { ChannelId } from '../../domain/types'
import type { Icp } from '../icp/types'

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
}

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
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`setup ${res.status}`)
      const out = (await res.json()) as WorkspaceSetup
      if (!out?.brand?.name) throw new Error('empty setup')
      return out
    } catch {
      return this.fallback.generate(input)
    }
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
    return {
      brand: { name, website: host, industry: p.industry, voice: p.voice },
      icp: {
        name: p.icpName,
        segment: p.segment,
        summary: `Likely buyers for ${name}: ${p.summary}`,
        firmographics: p.firmographics,
        pains: p.pains,
      },
      rtbs: [
        { id: 'proof-1', label: 'Fast time-to-value', detail: 'Live in days, not quarters.' },
        { id: 'proof-2', label: 'Cuts manual work', detail: 'Automates the busywork teams hate.' },
        { id: 'proof-3', label: 'Proven results', detail: 'Add a real customer outcome here.' },
      ],
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
