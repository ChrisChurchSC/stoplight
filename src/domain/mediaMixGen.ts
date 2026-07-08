import type { MixGoal, MixRisk } from './channelMix'

/**
 * "Generate a media mix with Claude." The tool already computes a deterministic
 * split from the brand's real Summer performance; this layer asks Claude to read
 * those same Summer numbers and the deterministic baseline and return a strategic
 * plan (which channels to lean on, a suggested split, and why). Claude only
 * interprets facts the app computed, so the heuristic fallback answers with the
 * same baseline, key or not.
 */

/** Real, measured per-channel performance from the Summer-backed content library. */
export interface MixGenPerf {
  channel: string
  label: string
  reach: number
  engRate: number
  posts: number
}

/** The deterministic split the tool already shows, handed to Claude as the baseline. */
export interface MixGenBaseline {
  channel: string
  label: string
  kind: string
  sharePct: number
  dollars: number
  reach: number
  conversions: number
}

export interface MixGenContext {
  brand: string
  goal: MixGoal
  budget: number
  risk: MixRisk
  performance: MixGenPerf[]
  baseline: MixGenBaseline[]
}

export interface MixGenChannel {
  channel: string
  label: string
  sharePct: number
  rationale: string
}

export interface MixGenPlan {
  summary: string
  goal: MixGoal
  risk: MixRisk
  channels: MixGenChannel[]
}

const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)))

/**
 * Offline plan built straight from the deterministic baseline (which is itself
 * grounded in the brand's Summer performance), so it's never wrong, only less
 * fluent than the live model.
 */
export function heuristicMixPlan(ctx: MixGenContext): MixGenPlan {
  const perfBy = new Map(ctx.performance.map((p) => [p.channel, p]))
  const totalReach = ctx.performance.reduce((a, p) => a + p.reach, 0) || 1
  const channels: MixGenChannel[] = ctx.baseline
    .filter((b) => b.sharePct > 0)
    .map((b) => {
      const p = perfBy.get(b.channel)
      let rationale: string
      if (p && p.reach > 0) {
        const share = Math.round((p.reach / totalReach) * 100)
        rationale = `Your organic ${b.label.split(' ')[0]} already earns ${fmt(p.reach)} reach across ${p.posts} posts, ${share}% of proven reach. Paid amplification compounds a channel that works.`
      } else if (b.channel === 'email') {
        rationale = 'Owned list at near-zero cost and the highest conversion rate. Cheap dollars that convert.'
      } else if (b.channel === 'google-search') {
        rationale = 'High-intent demand capture, strong for a conversions goal even without organic history.'
      } else {
        rationale = 'A measured test bet against the benchmark, no brand history here yet.'
      }
      return { channel: b.channel, label: b.label, sharePct: b.sharePct, rationale }
    })

  const top = channels[0]
  const proven = ctx.performance.filter((p) => p.reach > 0).sort((a, b) => b.reach - a.reach)[0]
  const provenLine = proven
    ? `**${proven.label}** is your strongest proven channel at ${fmt(proven.reach)} reach.`
    : `You have no measured channel history yet, so this leans on benchmarks.`

  const summary = [
    `Here is a **${ctx.goal}** plan for **${ctx.brand}** at ${'$' + ctx.budget.toLocaleString()}, ${ctx.risk} risk, weighted by your real Summer performance.`,
    '',
    provenLine,
    top ? `The plan concentrates **${top.sharePct}%** of budget on ${top.label} and spreads the rest across ${channels.length - 1} more channels.` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return { summary, goal: ctx.goal, risk: ctx.risk, channels }
}
