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
  /** GTM strategy key for the first campaign. */
  strategy: string
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

/** Deterministic fallback — a real, editable starting point with no API key. */
export class HeuristicSetupGenerator implements SetupGenerator {
  async generate({ url }: SetupInput): Promise<WorkspaceSetup> {
    const { name, host } = domainToBrand(url)
    return {
      brand: {
        name,
        website: host,
        industry: 'B2B SaaS',
        voice: 'Clear, direct, and credible. Lead with proof, skip the hype.',
      },
      icp: {
        name: 'Mid-market operators',
        segment: 'Tier 1, best-fit accounts',
        summary: `Likely buyers for ${name}: teams drowning in manual, fragmented work who want fast time-to-value and proof over promises.`,
        firmographics: [
          { label: 'Industry', value: 'B2B SaaS' },
          { label: 'Company size', value: '50–1,000 employees' },
          { label: 'Buyer', value: 'Head of Ops / Growth' },
          { label: 'Region', value: 'North America' },
        ],
        pains: ['manual workflows', 'slow tools', 'fragmented stack', 'time-to-value'],
      },
      rtbs: [
        { id: 'proof-1', label: 'Fast time-to-value', detail: 'Live in days, not quarters.' },
        { id: 'proof-2', label: 'Cuts manual work', detail: 'Automates the busywork teams hate.' },
        { id: 'proof-3', label: 'Proven results', detail: 'Add a real customer outcome here.' },
      ],
      channelMix: ['google-search', 'meta-ads', 'linkedin', 'email', 'blog', 'landing-page'],
      strategy: 'demand-gen',
      campaign: { name: `${name} — Demand Gen`, durationWeeks: 8, monthlyVolume: 30, overallBudget: 20000 },
    }
  }
}
