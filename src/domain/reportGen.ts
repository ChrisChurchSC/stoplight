import type { AudienceType } from './audiences'
import { CHANNELS } from './channels'
import { funnelStageFor, type FunnelStage } from './funnel'
import type { ReportKind } from './reports'
import type { ChannelId, RowStatus, TrafficRow } from './types'

/**
 * Generates a brand Report from the brand's real data (its campaign assets + segments), with no
 * AI call — a grounded, dated synthesis of the same signals the live Insights read shows, rendered
 * as self-contained HTML for the Reports frame. Works offline; a live-AI writer can supersede it
 * later. Kept pure (data in, {title, html} out) so it's testable and callable from the chat.
 */

const STAGES: FunnelStage[] = ['awareness', 'consideration', 'conversion', 'retention']
const STAGE_LABEL: Record<FunnelStage, string> = {
  awareness: 'Awareness',
  consideration: 'Consideration',
  conversion: 'Conversion',
  retention: 'Retention',
}
const STATUS_LABEL: Record<RowStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  scheduled: 'Scheduled',
  posted: 'Live / posted',
  failed: 'Failed',
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const stageOf = (r: TrafficRow): FunnelStage => r.funnelStage ?? funnelStageFor(r.channel, r.assetType)

const fmtDate = (ms: number): string => {
  const d = new Date(ms)
  return `${d.toLocaleString('en-US', { month: 'long' })} ${d.getDate()}, ${d.getFullYear()}`
}

/** A labeled horizontal bar (count relative to the largest in its group). */
const bar = (label: string, n: number, max: number): string => {
  const pct = max > 0 ? Math.round((n / max) * 100) : 0
  return `<div class="row"><span class="row-l">${esc(label)}</span><span class="row-bar"><span class="row-fill" style="width:${pct}%"></span></span><span class="row-n">${n}</span></div>`
}

export interface ReportInput {
  brand: string
  /** The brand's campaign assets (already scoped to the brand). */
  rows: TrafficRow[]
  /** The brand's audience segments. */
  audiences: AudienceType[]
  /** Report timestamp (defaults to now). */
  now?: number
}

export function buildBrandReport(input: ReportInput): { title: string; kind: ReportKind; summary: string; html: string } {
  const { brand, rows, audiences } = input
  const now = input.now ?? Date.now()

  // --- Aggregate the real data ---------------------------------------------------------------
  const byStage = STAGES.reduce((m, s) => ({ ...m, [s]: 0 }), {} as Record<FunnelStage, number>)
  const byChannel = new Map<ChannelId, number>()
  const byStatus = new Map<RowStatus, number>()
  const targetedAudiences = new Set<string>()
  for (const r of rows) {
    byStage[stageOf(r)]++
    byChannel.set(r.channel, (byChannel.get(r.channel) ?? 0) + 1)
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1)
    if (r.audience) targetedAudiences.add(r.audience.trim().toLowerCase())
  }
  const channelsUsed = [...byChannel.entries()].sort((a, b) => b[1] - a[1])
  const topChannels = channelsUsed.slice(0, 6)
  const statuses = [...byStatus.entries()].sort((a, b) => b[1] - a[1])
  const live = (byStatus.get('scheduled') ?? 0) + (byStatus.get('posted') ?? 0)
  const drafts = byStatus.get('draft') ?? 0

  // --- Heuristic recommendations (gaps in the real data) -------------------------------------
  const recs: string[] = []
  for (const s of STAGES) if (!byStage[s]) recs.push(`No <strong>${STAGE_LABEL[s]}</strong> assets yet — the funnel has a gap at ${STAGE_LABEL[s].toLowerCase()}.`)
  for (const a of audiences) {
    if (!a.name) continue
    if (!targetedAudiences.has(a.name.trim().toLowerCase()))
      recs.push(`Segment <strong>${esc(a.name)}</strong> has no assets targeted to it — nothing in the library speaks to them directly.`)
  }
  if (rows.length && drafts > live) recs.push(`Most assets are still drafts (${drafts} of ${rows.length}); only ${live} are scheduled or live.`)
  if (!audiences.length) recs.push(`No audience segments are defined for ${esc(brand)} yet — define them in Segments so messaging can be aimed.`)
  if (!rows.length) recs.push(`No campaign assets found for ${esc(brand)} — the library is empty, so this report has nothing to read yet.`)
  const topRecs = recs.slice(0, 6)

  // --- Narrative summary ---------------------------------------------------------------------
  const summary =
    rows.length > 0
      ? `${rows.length} assets across ${channelsUsed.length} ${channelsUsed.length === 1 ? 'channel' : 'channels'} and ${audiences.length} ${audiences.length === 1 ? 'segment' : 'segments'}; ${live} scheduled or live.`
      : `No assets in the library yet for ${brand}.`

  const title = `${brand} — Library & Messaging Read`
  const stageMax = Math.max(1, ...STAGES.map((s) => byStage[s]))
  const chanMax = Math.max(1, ...topChannels.map(([, n]) => n))
  const statMax = Math.max(1, ...statuses.map(([, n]) => n))

  // --- Render self-contained HTML ------------------------------------------------------------
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  :root { --ink:#1c1c22; --muted:#6b6b76; --line:#e7e7ec; --accent:#ff5fa8; --bg:#ffffff; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:var(--ink); background:var(--bg); }
  .doc { max-width:760px; margin:0 auto; padding:44px 40px 64px; }
  .eyebrow { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); font-weight:700; }
  h1 { font-size:28px; line-height:1.2; margin:6px 0 4px; letter-spacing:-.01em; }
  .date { color:var(--muted); font-size:13px; margin-bottom:28px; }
  h2 { font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); font-weight:700; margin:34px 0 12px; padding-bottom:7px; border-bottom:1px solid var(--line); }
  p { margin:0 0 12px; }
  .lead { font-size:16px; color:var(--ink); }
  .row { display:flex; align-items:center; gap:12px; margin:7px 0; }
  .row-l { width:180px; flex:none; font-size:13px; color:var(--ink); }
  .row-bar { flex:1; height:9px; background:var(--line); border-radius:5px; overflow:hidden; }
  .row-fill { display:block; height:100%; background:var(--accent); border-radius:5px; }
  .row-n { width:32px; flex:none; text-align:right; font-variant-numeric:tabular-nums; color:var(--muted); font-size:13px; }
  ul { margin:0; padding-left:20px; }
  li { margin:6px 0; }
  .seg { border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:8px 0; }
  .seg-n { font-weight:650; }
  .seg-m { color:var(--muted); font-size:13px; margin-top:2px; }
  .empty { color:var(--muted); font-style:italic; }
  .foot { margin-top:40px; padding-top:14px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }
  </style></head><body><div class="doc">
    <div class="eyebrow">Analysis</div>
    <h1>${esc(title)}</h1>
    <div class="date">${fmtDate(now)}</div>

    <p class="lead">${esc(summary)}</p>

    <h2>Coverage by funnel stage</h2>
    ${STAGES.map((s) => bar(STAGE_LABEL[s], byStage[s], stageMax)).join('')}

    <h2>Channels in play</h2>
    ${topChannels.length ? topChannels.map(([id, n]) => bar(CHANNELS[id]?.label ?? id, n, chanMax)).join('') : '<p class="empty">No channels yet.</p>'}

    <h2>Production status</h2>
    ${statuses.length ? statuses.map(([s, n]) => bar(STATUS_LABEL[s], n, statMax)).join('') : '<p class="empty">Nothing produced yet.</p>'}

    <h2>Audience segments</h2>
    ${
      audiences.length
        ? audiences
            .map((a) => {
              const meta = [a.messageAngle, a.outcome].filter(Boolean).join(' · ')
              return `<div class="seg"><div class="seg-n">${esc(a.name || 'Untitled segment')}</div>${meta ? `<div class="seg-m">${esc(meta)}</div>` : ''}</div>`
            })
            .join('')
        : '<p class="empty">No segments defined yet.</p>'
    }

    <h2>Recommendations</h2>
    ${topRecs.length ? `<ul>${topRecs.map((r) => `<li>${r}</li>`).join('')}</ul>` : '<p class="empty">No gaps found — coverage looks complete across stages and segments.</p>'}

    <div class="foot">Generated by Hyperfocus from ${esc(brand)}'s library and segments on ${fmtDate(now)}. A point-in-time synthesis; regenerate as the library moves.</div>
  </div></body></html>`

  return { title, kind: 'analysis', summary, html }
}
