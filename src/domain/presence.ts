import { CHANNELS, type ChannelKind } from './channels'
import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from './funnel'
import type { ChannelId, TrafficRow } from './types'

/**
 * The brand's standing PRESENCE profile, computed from its live content: which
 * channels it's active on, the dominant content format, posting cadence, the
 * CTAs it leans on, and where its channel mix leaves the customer journey
 * uncovered. Part of the Foundation — how the brand actually shows up — and a
 * source of gaps (a journey stage with no channel is a hole in the funnel).
 */
export interface ChannelUse {
  channel: ChannelId
  label: string
  count: number
  kind: ChannelKind
  color: string
}
export interface CtaUse {
  label: string
  count: number
}
export interface StageCoverage {
  stage: FunnelStage
  label: string
  hint: string
  channels: string[]
  covered: boolean
  /** When uncovered: a couple of channels that would fill the stage. */
  suggest: string[]
}
export interface BrandPresence {
  total: number
  channels: ChannelUse[]
  topFormat: { label: string; count: number } | null
  cadencePerMonth: number
  busiestDay: string | null
  ctas: CtaUse[]
  deadEnds: number
  journey: StageCoverage[]
}

const FORMAT_BY_CHANNEL: Partial<Record<ChannelId, string>> = {
  instagram: 'Image & video', tiktok: 'Image & video', pinterest: 'Image & video',
  'meta-ads': 'Image & video', 'tiktok-ads': 'Image & video', 'pinterest-ads': 'Image & video',
  youtube: 'Video', 'youtube-ads': 'Video',
  linkedin: 'Text & link', x: 'Text & link', facebook: 'Text & link', 'linkedin-ads': 'Text & link',
  blog: 'Article', website: 'Web page', 'landing-page': 'Web page',
  email: 'Email', sms: 'Direct message', push: 'Direct message',
}
export const formatOf = (ch: ChannelId): string => FORMAT_BY_CHANNEL[ch] ?? 'Other'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// High-leverage channels to fill a stage that has no active coverage.
const SUGGEST_BY_STAGE: Record<FunnelStage, ChannelId[]> = {
  awareness: ['instagram', 'youtube', 'tiktok'],
  consideration: ['linkedin', 'blog', 'youtube'],
  conversion: ['landing-page', 'google-search', 'email'],
  retention: ['email', 'sms', 'push'],
}

/** Collapse a CTA string to the destination it drives — the recurring intents. */
function normalizeCta(cta: string): string {
  const x = cta.toLowerCase()
  if (/subscribe|newsletter/.test(x)) return 'Subscribe to the newsletter'
  if (/tickets|screening/.test(x)) return 'Get tickets / attend a screening'
  if (/wefunder|double your impact|invest|campaign|donate/.test(x)) return 'Invest / donate'
  if (/annual report|read our/.test(x)) return 'Read the report'
  if (/link in bio|listen|watch|spotify|apple|episode|podcast/.test(x)) return 'Link in bio → the podcast'
  return cta.slice(0, 40)
}

export function brandPresence(rows: TrafficRow[]): BrandPresence {
  const chCount = new Map<ChannelId, number>()
  for (const r of rows) chCount.set(r.channel, (chCount.get(r.channel) ?? 0) + 1)

  const channels: ChannelUse[] = [...chCount.entries()]
    .map(([channel, count]) => ({
      channel,
      count,
      label: CHANNELS[channel]?.label ?? channel,
      kind: CHANNELS[channel]?.kind ?? 'organic',
      color: CHANNELS[channel]?.color ?? '#888',
    }))
    .sort((a, b) => b.count - a.count)

  const fmtCount = new Map<string, number>()
  for (const r of rows) fmtCount.set(formatOf(r.channel), (fmtCount.get(formatOf(r.channel)) ?? 0) + 1)
  const topFmt = [...fmtCount.entries()].sort((a, b) => b[1] - a[1])[0]
  const topFormat = topFmt ? { label: topFmt[0], count: topFmt[1] } : null

  // Cadence + busiest day from real posted dates (time-of-day isn't captured).
  const dated = rows.map((r) => r.postedAt).filter((t): t is number => !!t).sort((a, b) => a - b)
  let cadencePerMonth = 0
  let busiestDay: string | null = null
  if (dated.length >= 2) {
    const months = Math.max(1, (dated[dated.length - 1] - dated[0]) / (1000 * 60 * 60 * 24 * 30.44))
    cadencePerMonth = Math.round((dated.length / months) * 10) / 10
    const dayCount = new Array(7).fill(0)
    for (const t of dated) dayCount[new Date(t).getDay()]++
    busiestDay = DAYS[dayCount.indexOf(Math.max(...dayCount))]
  }

  const ctaCount = new Map<string, number>()
  let deadEnds = 0
  for (const r of rows) {
    const cta = ((r.messaging ?? {}) as Record<string, string | undefined>).cta?.trim()
    if (!cta) { deadEnds++; continue }
    const norm = normalizeCta(cta)
    ctaCount.set(norm, (ctaCount.get(norm) ?? 0) + 1)
  }
  const ctas: CtaUse[] = [...ctaCount.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const stageChannels = new Map<FunnelStage, Set<string>>()
  for (const ch of chCount.keys()) {
    const stage = funnelStageFor(ch)
    if (!stageChannels.has(stage)) stageChannels.set(stage, new Set())
    stageChannels.get(stage)!.add(CHANNELS[ch]?.label ?? ch)
  }
  const journey: StageCoverage[] = FUNNEL_STAGES.map((s) => {
    const chs = [...(stageChannels.get(s.stage) ?? [])]
    const covered = chs.length > 0
    return {
      stage: s.stage,
      label: s.label,
      hint: s.hint,
      channels: chs,
      covered,
      suggest: covered
        ? []
        : SUGGEST_BY_STAGE[s.stage].filter((c) => !chCount.has(c)).map((c) => CHANNELS[c]?.label ?? c),
    }
  })

  return { total: rows.length, channels, topFormat, cadencePerMonth, busiestDay, ctas, deadEnds, journey }
}
