import { resolveStrategyKey } from './strategies'
import type { TrafficRow } from './types'

/**
 * Campaign goal, resolved. Two halves: the MESSAGE (what all the assets are aiming to
 * communicate, summarized from the cards themselves so it stays true to the work) and
 * the KPI + target (how success is measured). The message is derived from the campaign's
 * dominant proof point and audience unless a hand-written override is stored.
 */

export interface CampaignGoal {
  message: string
  /** True when the message was summarized from the assets (no manual override). */
  derived: boolean
  kpi: string
  target: number | null
  /** A single-sentence summary of the whole goal (KPI + target + message). */
  sentence: string
}

export interface CampaignGoalMeta {
  goalMessage?: string
  goalKpi?: string
  goalTarget?: number
  strategy?: string
}

// A sensible default KPI per GTM playbook, so a fresh goal isn't blank. Subscribers is
// the fallback (the north-star for a content/audience brand like this one).
const KPI_BY_STRATEGY: Record<string, string> = {
  'demand-gen': 'Leads',
  plg: 'Sign-ups',
  'sales-led': 'Opportunities',
  lifecycle: 'Retained customers',
  aarrr: 'Activations',
  bowtie: 'Revenue',
  abm: 'Target accounts',
  'content-seo': 'Organic sessions',
  outbound: 'Meetings booked',
  community: 'Active members',
  'local-takeover': 'Local reach',
}

export function defaultKpiForStrategy(strategy?: string): string {
  const key = resolveStrategyKey((strategy ?? '').trim())
  return (key && KPI_BY_STRATEGY[key]) || 'Subscribers'
}

/** Summarize what a campaign's assets communicate: the proof point they most lean on, to
 *  the audience they most target. Grounded in the cards, so it moves as the work moves. */
export function deriveCampaignMessage(rows: TrafficRow[], rtbPool: { id: string; label: string }[]): string {
  const aud = new Map<string, number>()
  const rtb = new Map<string, number>()
  for (const r of rows) {
    const a = (r.audience ?? '').trim()
    if (a) aud.set(a, (aud.get(a) ?? 0) + 1)
    const m = r.rtbMap ?? {}
    for (const k of Object.keys(m)) for (const id of m[k] ?? []) rtb.set(id, (rtb.get(id) ?? 0) + 1)
  }
  const topAud = [...aud.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const topRtbId = [...rtb.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const proof = topRtbId ? rtbPool.find((x) => x.id === topRtbId)?.label : undefined
  if (proof) return topAud ? `${proof}, to ${topAud}` : proof
  // No proof reference: fall back to a shared headline, then the audience alone.
  const head = rows.map((r) => (r.messaging?.headline ?? '').trim()).find(Boolean)
  if (head) return topAud ? `${head} — for ${topAud}` : head
  return topAud ? `Reaching ${topAud}` : ''
}

export const goalVerb = (kpi: string): string => {
  const k = kpi.toLowerCase()
  if (/subscrib|follow|member|audience|communit/.test(k)) return 'Grow'
  if (/view|reach|impression|aware|traffic|session/.test(k)) return 'Reach'
  if (/lead|sign|meeting|donat|purchase|revenue|sale|opportun|activation|account/.test(k)) return 'Drive'
  return 'Hit'
}

/** The whole goal as one sentence: the KPI + target it drives, and the message it rides on. */
export function composeGoalSentence(kpi: string, target: number | null, message: string): string {
  const head = `${goalVerb(kpi)} ${target != null ? `${fmtTarget(target)} ` : ''}${kpi.toLowerCase().trim()}`
  const msg = message.trim()
  return msg ? `${head} by communicating ${msg}.` : `${head}.`
}

/** Resolve a campaign's full goal: message (override or derived) + KPI (set or defaulted) + target. */
export function resolveCampaignGoal(
  meta: CampaignGoalMeta | undefined,
  rows: TrafficRow[],
  rtbPool: { id: string; label: string }[],
): CampaignGoal {
  const override = (meta?.goalMessage ?? '').trim()
  const message = override || deriveCampaignMessage(rows, rtbPool)
  const kpi = (meta?.goalKpi ?? '').trim() || defaultKpiForStrategy(meta?.strategy)
  const target = typeof meta?.goalTarget === 'number' ? meta.goalTarget : null
  return { message, derived: !override, kpi, target, sentence: composeGoalSentence(kpi, target, message) }
}

/** Compact number for a target: 2000 → "2,000", 12000 → "12k". */
export const fmtTarget = (n: number): string =>
  n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString()

export interface PortfolioGoalSummary {
  sentence: string
  /** Campaigns carrying the dominant KPI. */
  count: number
  total: number
  kpi: string
  /** Summed target across campaigns on the dominant KPI. */
  target: number
  audiences: string[]
  /** Share of the brand target these campaigns plan to contribute (0..1), when comparable. */
  progress: number | null
}

/** Roll a brand's campaign goals into one sentence: the dominant KPI + summed target (as a
 *  share of the brand's north-star when set) and the audiences the assets most speak to. */
export function summarizePortfolioGoals(
  cards: { goal: CampaignGoal; rows: TrafficRow[] }[],
  brandKpi?: string,
  brandTarget?: number | null,
): PortfolioGoalSummary | null {
  if (!cards.length) return null
  const kpiMap = new Map<string, { kpi: string; count: number; target: number }>()
  const audMap = new Map<string, number>()
  for (const c of cards) {
    const g = c.goal
    const cur = kpiMap.get(g.kpi) ?? { kpi: g.kpi, count: 0, target: 0 }
    cur.count += 1
    if (g.target != null) cur.target += g.target
    kpiMap.set(g.kpi, cur)
    for (const row of c.rows) {
      const a = (row.audience ?? '').trim()
      if (a) audMap.set(a, (audMap.get(a) ?? 0) + 1)
    }
  }
  const top = [...kpiMap.values()].sort((a, b) => b.count - a.count || b.target - a.target)[0]
  if (!top) return null
  const audiences = [...audMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([a]) => a)
  const bk = (brandKpi ?? '').trim()
  const comparable = !!bk && !!brandTarget && top.target > 0 && top.kpi.toLowerCase() === bk.toLowerCase()
  const progress = comparable ? top.target / (brandTarget as number) : null
  const verb = goalVerb(top.kpi).toLowerCase()
  const tgt = top.target > 0 ? `${fmtTarget(top.target)} ` : ''
  const audStr = audiences.length ? `, speaking mostly to ${audiences.join(' and ')}` : ''
  const scope = top.count === cards.length ? `All ${cards.length}` : `${top.count} of ${cards.length}`
  const prog = progress != null ? ` (${Math.round(progress * 100)}% of the ${fmtTarget(brandTarget as number)} goal)` : ''
  const sentence = `${scope} campaigns aim to ${verb} ${tgt}${top.kpi.toLowerCase()}${prog}${audStr}.`
  return { sentence, count: top.count, total: cards.length, kpi: top.kpi, target: top.target, audiences, progress }
}
