import { useMemo, useState } from 'react'
import { CHANNELS } from '../domain/channels'
import { contentFlow } from '../domain/contentSignals'
import type { DataUnlock, UnlockVisual } from '../domain/dataUnlocks'
import { formatReach } from '../domain/journeyPerf'
import type { ChannelId, TrafficRow } from '../domain/types'

const num = (n: number): string => n.toLocaleString()
/** A row's subscriber count, when the source reported one. */
const subsOf = (r: TrafficRow): number =>
  typeof r.socialMetrics?.subscribers === 'number' ? r.socialMetrics.subscribers : 0

// Validated categorical palette (dataviz reference, CVD-safe ordering, light-mode
// worst adjacent ΔE 24.2). Channels map to slots in a fixed order — color follows the
// channel, never its rank.
const PALETTE = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834']
const CH_ORDER = ['instagram', 'youtube', 'website', 'email', 'linkedin', 'events', 'landing-page', 'x', 'tiktok', 'facebook']
const chColor = (ch: string): string => {
  const i = CH_ORDER.indexOf(ch)
  return i >= 0 ? PALETTE[i % PALETTE.length] : '#898781'
}

/**
 * The visual layer of the Findings dashboard. Big tone-colored numbers lead the
 * single-value findings; ranked lists keep bars; the two summary charts up top use
 * textured, rounded bars. Every measure is single-hue (the accent) except where a
 * value has a clear good/bad direction, which colors the number green/amber/red.
 */

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const clip = (s: string, n = 30): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** A row's headline reach: views, else impressions, else reach, else its largest metric. */
function reachOf(r: TrafficRow): number {
  const m = r.socialMetrics
  if (!m) return 0
  if (typeof m.views === 'number') return m.views
  if (typeof m.impressions === 'number') return m.impressions
  if (typeof m.reach === 'number') return m.reach
  const nums = Object.values(m).filter((v): v is number => typeof v === 'number')
  return nums.length ? Math.max(...nums) : 0
}
const channelLabel = (ch: string): string => CHANNELS[ch as ChannelId]?.label ?? ch

/** A row's post date as ms (postedAt / publishedAt), date-only strings read local. */
function postMs(r: TrafficRow): number | null {
  if (typeof r.postedAt === 'number') return r.postedAt
  const iso = r.publishedAt ?? (typeof r.postedAt === 'string' ? r.postedAt : undefined)
  if (iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
    if (!Number.isNaN(d.getTime())) return d.getTime()
  }
  return null
}

export function FindingsCharts({ items }: { items: TrafficRow[] }) {
  const byChannel = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of items) m.set(String(r.channel), (m.get(String(r.channel)) ?? 0) + reachOf(r))
    return [...m.entries()]
      .map(([channel, reach]) => ({ channel, reach }))
      .filter((c) => c.reach > 0)
      .sort((a, b) => b.reach - a.reach)
      .slice(0, 6)
  }, [items])

  const overTime = useMemo(() => {
    const m = new Map<string, { reach: number; t: number }>()
    for (const r of items) {
      const ms = postMs(r)
      if (ms == null) continue
      const d = new Date(ms)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const cur = m.get(key) ?? { reach: 0, t: new Date(d.getFullYear(), d.getMonth(), 1).getTime() }
      cur.reach += reachOf(r)
      m.set(key, cur)
    }
    return [...m.values()]
      .sort((a, b) => a.t - b.t)
      .map((x) => ({ reach: x.reach, label: MO[new Date(x.t).getMonth()] }))
  }, [items])

  const maxChannel = byChannel[0]?.reach ?? 0
  if (!maxChannel) return null

  return (
    <div className="fchart-row">
      <section className="fchart">
        <div className="fchart-head">Reach by channel</div>
        <div className="fchart-bars">
          {byChannel.map((c) => (
            <div className="fchart-bar-row" key={c.channel} title={`${channelLabel(c.channel)} · ${formatReach(c.reach)}`}>
              <span className="fchart-bar-label">{channelLabel(c.channel)}</span>
              <div className="fchart-bar-track">
                <div className="fchart-bar-fill" style={{ width: `${Math.max(2, (c.reach / maxChannel) * 100)}%` }} />
              </div>
              <span className="fchart-bar-val">{formatReach(c.reach)}</span>
            </div>
          ))}
        </div>
      </section>

      {overTime.length >= 2 && <ReachOverTime data={overTime} />}
    </div>
  )
}

/** Reach per month as bold, rounded, textured vertical bars. */
function ReachOverTime({ data }: { data: { reach: number; label: string }[] }) {
  const max = Math.max(...data.map((d) => d.reach), 1)
  const [hover, setHover] = useState<number | null>(null)
  return (
    <section className="fchart">
      <div className="fchart-head">Reach over time</div>
      <div className="fchart-vbars">
        {data.map((d, i) => (
          <div
            className="fchart-vcol"
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="fchart-vbar-wrap">
              {hover === i && <span className="fchart-vtip">{formatReach(d.reach)}</span>}
              <div className={`fchart-vbar${hover === i ? ' hot' : ''}`} style={{ height: `${Math.max(3, (d.reach / max) * 100)}%` }} />
            </div>
            <span className="fchart-vx">{d.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** A pie of a single proportion (0..1): a tone-colored slice from 12 o'clock. */
function Pie({ pct, tone }: { pct: number; tone: string }) {
  const r = 26
  const c = 30
  const p = Math.max(0, Math.min(1, pct))
  const ang = p * 2 * Math.PI
  const x = c + r * Math.sin(ang)
  const y = c - r * Math.cos(ang)
  const large = p > 0.5 ? 1 : 0
  const wedge = `M ${c} ${c} L ${c} ${c - r} A ${r} ${r} 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`
  return (
    <svg viewBox="0 0 60 60" className={`fpie t-${tone}`} width="56" height="56" aria-hidden="true">
      <circle cx={c} cy={c} r={r} className="fpie-bg" />
      {p >= 0.999 ? <circle cx={c} cy={c} r={r} className="fpie-slice" /> : <path d={wedge} className="fpie-slice" />}
    </svg>
  )
}

/** The hero of a single-value finding: a pie of the proportion (or a signed number for a
 *  trend), with the value in big type, all colored by its good/warn/bad tone. */
export function FindingHero({ visual }: { visual: UnlockVisual }) {
  if (visual.kind === 'bars') return null
  const tone = visual.tone ?? 'none'
  if (visual.kind === 'delta') {
    const up = visual.pct >= 0
    return (
      <div className={`lfind-hero t-${tone}`}>
        <span className="lfind-hero-num">
          {up ? '▲' : '▼'} {up ? '+' : '−'}
          {Math.abs(Math.round(visual.pct))}%
        </span>
      </div>
    )
  }
  const pct = visual.kind === 'meter' ? visual.value : visual.whole ? visual.part / visual.whole : 0
  return (
    <div className={`lfind-hero t-${tone}`}>
      <Pie pct={pct} tone={tone} />
      <div className="lfind-hero-txt">
        <span className="lfind-hero-num">{Math.round(pct * 100)}%</span>
        {visual.kind === 'ratio' && <span className="lfind-hero-sub">{visual.part} of {visual.whole}</span>}
      </div>
    </div>
  )
}

/** The headline metrics band — big stat tiles across the top of the dashboard. */
export function KpiBand({ items }: { items: TrafficRow[] }) {
  const kpis = useMemo(() => {
    const totalReach = items.reduce((s, r) => s + reachOf(r), 0)
    const subs = items.reduce((s, r) => s + subsOf(r), 0)
    const posts = items.length
    const avg = posts ? Math.round(totalReach / posts) : 0
    const deadEnd = items.length ? contentFlow(items).overall.deadEndPct : 0
    return [
      { label: 'Total reach', value: formatReach(totalReach) },
      { label: 'Subscribers', value: num(subs) },
      { label: 'Posts', value: num(posts) },
      { label: 'Avg reach / post', value: formatReach(avg) },
      { label: 'Dead-end', value: `${deadEnd}%` },
    ]
  }, [items])
  if (!items.length) return null
  return (
    <div className="kpi-band">
      {kpis.map((k) => (
        <div className="kpi" key={k.label}>
          <span className="kpi-num">{k.value}</span>
          <span className="kpi-label">{k.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Each channel plotted at (reach, subscribers) — the two-engines split in one picture. */
export function ReachSubsScatter({ items }: { items: TrafficRow[] }) {
  const data = useMemo(() => {
    const m = new Map<string, { reach: number; subs: number }>()
    for (const r of items) {
      const ch = String(r.channel)
      const cur = m.get(ch) ?? { reach: 0, subs: 0 }
      cur.reach += reachOf(r)
      cur.subs += subsOf(r)
      m.set(ch, cur)
    }
    return [...m.entries()].map(([channel, v]) => ({ channel, ...v })).filter((d) => d.reach > 0)
  }, [items])
  if (data.length < 2) return null
  const W = 320
  const H = 210
  const padL = 40
  const padB = 34
  const maxR = Math.max(...data.map((d) => d.reach), 1)
  const maxS = Math.max(...data.map((d) => d.subs), 1)
  const x = (r: number) => padL + (r / maxR) * (W - padL - 16)
  const y = (s: number) => H - padB - (s / maxS) * (H - padB - 18)
  return (
    <section className="fchart">
      <div className="fchart-head">Reach vs subscribers, by channel</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fscatter">
        <line x1={padL} y1={H - padB} x2={W - 8} y2={H - padB} className="fscatter-axis" />
        <line x1={padL} y1={16} x2={padL} y2={H - padB} className="fscatter-axis" />
        <text className="fscatter-axtext" x={W - 8} y={H - padB + 18} textAnchor="end">reach →</text>
        <text className="fscatter-axtext" x={padL - 6} y={14} textAnchor="end">subs ↑</text>
        {data.map((d) => (
          <g key={d.channel}>
            <circle cx={x(d.reach)} cy={y(d.subs)} r={7} fill={chColor(d.channel)} className="fscatter-dot" />
            <text x={x(d.reach)} y={y(d.subs) - 11} className="fscatter-label" textAnchor="middle">
              {channelLabel(d.channel)}
            </text>
          </g>
        ))}
      </svg>
    </section>
  )
}

/** Posts by weekday — where posting actually lands across the week. */
export function PostingByWeekday({ items }: { items: TrafficRow[] }) {
  const counts = useMemo(() => {
    const c = [0, 0, 0, 0, 0, 0, 0] // Mon..Sun
    for (const r of items) {
      const ms = postMs(r)
      if (ms == null) continue
      c[(new Date(ms).getDay() + 6) % 7]++ // getDay() 0=Sun → shift so Mon=0, Sun=6
    }
    return c
  }, [items])
  const total = counts.reduce((a, b) => a + b, 0)
  if (!total) return null
  const max = Math.max(...counts, 1)
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return (
    <section className="fchart">
      <div className="fchart-head">Posts by weekday</div>
      <div className="fchart-vbars">
        {counts.map((c, i) => (
          <div className="fchart-vcol" key={i} title={`${DAYS[i]} · ${c} post${c === 1 ? '' : 's'}`}>
            <span className="fchart-vval">{c}</span>
            <div className="fchart-vbar-wrap">
              <div className="fchart-vbar" style={{ height: `${Math.max(2, (c / max) * 100)}%` }} />
            </div>
            <span className="fchart-vx">{DAYS[i]}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** How the channel mix of reach shifted month to month — stacked bars. */
export function ReachMixOverTime({ items }: { items: TrafficRow[] }) {
  const { months, channels } = useMemo(() => {
    const mm = new Map<string, { t: number; byCh: Map<string, number> }>()
    for (const r of items) {
      const ms = postMs(r)
      if (ms == null) continue
      const d = new Date(ms)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const rec = mm.get(key) ?? { t: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), byCh: new Map<string, number>() }
      const ch = String(r.channel)
      rec.byCh.set(ch, (rec.byCh.get(ch) ?? 0) + reachOf(r))
      mm.set(key, rec)
    }
    const months = [...mm.values()]
      .sort((a, b) => a.t - b.t)
      .map((m) => ({ label: MO[new Date(m.t).getMonth()], byCh: m.byCh, total: [...m.byCh.values()].reduce((a, b) => a + b, 0) }))
    const totals = new Map<string, number>()
    for (const m of months) for (const [ch, v] of m.byCh) totals.set(ch, (totals.get(ch) ?? 0) + v)
    const channels = [...totals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ch]) => ch)
    return { months, channels }
  }, [items])
  if (months.length < 2 || !channels.length) return null
  const max = Math.max(...months.map((m) => m.total), 1)
  return (
    <section className="fchart">
      <div className="fchart-head">Reach mix over time</div>
      <div className="fmix-bars">
        {months.map((m, i) => (
          <div className="fmix-col" key={i}>
            <div className="fmix-stack" style={{ height: `${(m.total / max) * 100}%` }}>
              {channels.map((ch) => {
                const v = m.byCh.get(ch) ?? 0
                if (!v) return null
                return <div key={ch} className="fmix-seg" style={{ height: `${(v / m.total) * 100}%`, background: chColor(ch) }} title={`${channelLabel(ch)} · ${formatReach(v)}`} />
              })}
            </div>
            <span className="fmix-x">{m.label}</span>
          </div>
        ))}
      </div>
      <div className="fmix-legend">
        {channels.map((ch) => (
          <span className="fmix-leg" key={ch}>
            <span className="fmix-dot" style={{ background: chColor(ch) }} />
            {channelLabel(ch)}
          </span>
        ))}
      </div>
    </section>
  )
}

// Flatten a finding's visual into two spreadsheet cells: a headline value and a breakdown.
function cellValue(v?: UnlockVisual): string {
  if (!v) return ''
  if (v.kind === 'meter') return `${Math.round(v.value * 100)}%`
  if (v.kind === 'ratio') return v.whole ? `${Math.round((v.part / v.whole) * 100)}%` : ''
  if (v.kind === 'delta') return `${v.pct >= 0 ? '▲ +' : '▼ −'}${Math.abs(Math.round(v.pct))}%`
  return v.data[0]?.display ?? ''
}
function cellDetail(v?: UnlockVisual): string {
  if (!v) return ''
  if (v.kind === 'ratio') return `${v.part} of ${v.whole}`
  if (v.kind === 'bars') return v.data.map((d) => `${d.label} ${d.display}`).join(' · ')
  return ''
}
const srcStr = (sources: { metric: string; current: number }[]): string =>
  sources.map((s) => `${num(s.current)} ${s.metric}`).join(' · ')

/** Every finding as a spreadsheet: one row each, category / metric / reading / value / breakdown / source. */
export function FindingsTable({ groups }: { groups: { category: string; found: DataUnlock[] }[] }) {
  const rows = groups.flatMap((g) => g.found.map((u) => ({ category: g.category, u })))
  return (
    <div className="ftable-wrap">
      <table className="ftable">
        <thead>
          <tr>
            <th>Category</th>
            <th>Finding</th>
            <th>Reading</th>
            <th className="ft-r">Value</th>
            <th>Breakdown</th>
            <th>Based on</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ category, u }) => (
            <tr key={u.id}>
              <td className="ft-cat">{category}</td>
              <td className="ft-metric">{u.title}</td>
              <td className="ft-read">{u.finding}</td>
              <td className={`ft-r ft-val t-${u.visual && u.visual.kind !== 'bars' ? u.visual.tone ?? 'none' : 'none'}`}>{cellValue(u.visual)}</td>
              <td className="ft-detail">{cellDetail(u.visual)}</td>
              <td className="ft-src">{srcStr(u.sources)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Ranked bars under a finding — top items by value, single-hue. */
export function FindingBars({ visual }: { visual: UnlockVisual }) {
  if (visual.kind !== 'bars') return null
  const max = Math.max(...visual.data.map((d) => d.value), 1)
  return (
    <div className="fvis-bars">
      {visual.data.map((d, i) => (
        <div className="fvis-bar-row" key={`${d.label}-${i}`} title={`${d.label} · ${d.display}`}>
          <span className="fvis-bar-label">{clip(d.label)}</span>
          <div className="fvis-bar-track">
            <div className="fvis-bar-fill" style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }} />
          </div>
          <span className="fvis-bar-val">{d.display}</span>
        </div>
      ))}
    </div>
  )
}
