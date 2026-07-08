import { useEffect, useMemo, useState } from 'react'
import { CHANNELS } from '../domain/channels'
import { recommendChannelMix, BENCH_CHANNEL_IDS, type ChannelPerf, type MediaMix, type MixChannel, type MixGoal, type MixRisk } from '../domain/channelMix'
import type { ChannelId } from '../domain/types'
import { generateMediaMix } from '../adapters/ask/generateMediaMix'
import type { MixGenContext, MixGenPlan } from '../domain/mediaMixGen'
import { Markdown } from '../lib/miniMarkdown'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'

const DEFAULT_BENCH = {
  paid: { cpm: 15, ctr: 0.008, cvr: 0.015 },
  organic: { cpm: 5, ctr: 0.012, cvr: 0.01 },
  owned: { cpm: 2, ctr: 0.025, cvr: 0.04 },
} as const
const REACH_FACTOR = 0.75

/**
 * Media mix — channel-mix recommenders as saved spreadsheets. One page shows ALL of a
 * brand's mixes stacked (conservative vs aggressive, etc.); each is a labeled card with a
 * goal / budget / risk header, a per-channel row of editable CPM / CTR / CVR benchmarks and
 * live Mix / Budget / Reach / Conversions blended with the brand's real organic performance,
 * plus a "Generate with Claude" panel. Add as many mixes as you like.
 */

const GOALS: { k: MixGoal; label: string }[] = [
  { k: 'reach', label: 'Reach' },
  { k: 'engagement', label: 'Engagement' },
  { k: 'conversions', label: 'Conversions' },
]
const RISKS: { k: MixRisk; label: string }[] = [
  { k: 'conservative', label: 'Conservative' },
  { k: 'balanced', label: 'Balanced' },
  { k: 'aggressive', label: 'Aggressive' },
]
const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(Math.round(n)))
const usd = (n: number) => '$' + Math.round(n).toLocaleString()

const ICON = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v9h9" />
  </>
)

export function MediaPlanView({ scopeClient }: { scopeClient?: string }) {
  const { canvases } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const brand = scopeClient ?? (clientFilter !== 'all' ? clientFilter : null)

  const mediaMixes = useTrafficStore((s) => s.mediaMixes)
  const addMediaMix = useTrafficStore((s) => s.addMediaMix)

  const brandMixes = useMemo(() => mediaMixes.filter((m) => m.brand === brand), [mediaMixes, brand])

  // Seed a first mix for the brand when it has none.
  useEffect(() => {
    if (brand && !brandMixes.length) addMediaMix(brand)
  }, [brand, brandMixes.length, addMediaMix])

  // Brand-level real performance, shared by every mix on the page.
  const perf: ChannelPerf[] = useMemo(() => {
    if (!brand) return []
    const rows = canvases.filter((c) => c.client === brand).flatMap((c) => c.rows)
    const by = new Map<ChannelId, { reach: number; eng: number; posts: number }>()
    const num = (v: unknown) => (typeof v === 'number' ? v : 0)
    for (const r of rows) {
      const m = (r.socialMetrics ?? {}) as Record<string, number>
      const reach = num(m.views) || num(m.impressions)
      if (!reach) continue
      const eng = num(m.likes) + num(m.comments) + num(m.shares)
      const cur = by.get(r.channel) ?? { reach: 0, eng: 0, posts: 0 }
      cur.reach += reach
      cur.eng += eng
      cur.posts++
      by.set(r.channel, cur)
    }
    return [...by.entries()].map(([channel, v]) => ({ channel, reach: v.reach, engRate: v.reach ? v.eng / v.reach : 0, posts: v.posts }))
  }, [canvases, brand])

  if (!brand) return <div className="mtx"><div className="mtx-empty">Pick a brand to plan a channel mix.</div></div>

  return (
    <div className="mplan">
      <div className="mplan-head">
        <div>
          <h2 className="mplan-h2">Media mixes</h2>
          <p className="mplan-h2-sub">Channel-mix plans for {brand}, weighted by real performance. Add as many scenarios as you like.</p>
        </div>
        <button className="mplan-new" onClick={() => addMediaMix(brand)}>
          ＋ New mix
        </button>
      </div>

      {brandMixes.map((m) => (
        <MediaMixCard key={m.id} mix={m} brand={brand} perf={perf} canDelete={brandMixes.length > 1} />
      ))}
    </div>
  )
}

function MediaMixCard({ mix, brand, perf, canDelete }: { mix: MediaMix; brand: string; perf: ChannelPerf[]; canDelete: boolean }) {
  const addMediaMix = useTrafficStore((s) => s.addMediaMix)
  const updateMediaMix = useTrafficStore((s) => s.updateMediaMix)
  const deleteMediaMix = useTrafficStore((s) => s.deleteMediaMix)

  const [genPlan, setGenPlan] = useState<(MixGenPlan & { live: boolean }) | null>(null)
  const [genLoading, setGenLoading] = useState(false)

  const result = useMemo(
    () => recommendChannelMix({ goal: mix.goal, budget: mix.budget, risk: mix.risk, perf, overrides: mix.overrides, extraChannels: mix.extraChannels }),
    [mix, perf],
  )

  const extraIds = new Set((mix.extraChannels ?? []).map((c) => c.channel))
  const usedIds = new Set(result.allocations.map((a) => a.channel))
  const available = Object.values(CHANNELS).filter((c) => !usedIds.has(c.id))

  const patch = (p: Partial<MediaMix>) => updateMediaMix(mix.id, p)
  const setBench = (channel: ChannelId, field: 'cpm' | 'ctr' | 'cvr', value: number) => {
    if (extraIds.has(channel)) {
      patch({ extraChannels: (mix.extraChannels ?? []).map((c) => (c.channel === channel ? { ...c, [field]: value } : c)) })
    } else {
      updateMediaMix(mix.id, { overrides: { ...mix.overrides, [channel]: { ...(mix.overrides[channel] ?? {}), [field]: value } } })
    }
  }
  const addChannel = (id: ChannelId) => {
    const c = CHANNELS[id]
    if (!c) return
    const d = DEFAULT_BENCH[c.kind]
    const mc: MixChannel = { channel: id, label: c.label, kind: c.kind, cpm: d.cpm, ctr: d.ctr, cvr: d.cvr, provenFrom: [id] }
    patch({ extraChannels: [...(mix.extraChannels ?? []), mc] })
  }
  const removeChannel = (id: ChannelId) => patch({ extraChannels: (mix.extraChannels ?? []).filter((c) => c.channel !== id) })

  const onGenerate = async () => {
    setGenLoading(true)
    const ctx: MixGenContext = {
      brand,
      goal: mix.goal,
      budget: mix.budget,
      risk: mix.risk,
      performance: perf.map((p) => ({ channel: p.channel, label: CHANNELS[p.channel]?.label ?? p.channel, reach: p.reach, engRate: p.engRate, posts: p.posts })),
      baseline: result.allocations.map((a) => ({ channel: a.channel, label: a.label, kind: a.kind, sharePct: a.pct, dollars: a.dollars, reach: a.reach, conversions: a.conversions })),
    }
    try {
      setGenPlan(await generateMediaMix(ctx))
    } finally {
      setGenLoading(false)
    }
  }

  // Turn Claude's plan into a real, saved mix: adopt its goal/risk and add any recommended
  // channel that isn't already a default benchmark row. It appears as a new card on the page.
  const saveGenAsMix = () => {
    if (!genPlan) return
    const id = addMediaMix(brand)
    const extras: MixChannel[] = genPlan.channels
      .filter((c) => !BENCH_CHANNEL_IDS.includes(c.channel as ChannelId) && CHANNELS[c.channel as ChannelId])
      .map((c) => {
        const ch = CHANNELS[c.channel as ChannelId]
        const d = DEFAULT_BENCH[ch.kind]
        return { channel: ch.id, label: ch.label, kind: ch.kind, cpm: d.cpm, ctr: d.ctr, cvr: d.cvr, provenFrom: [ch.id] }
      })
    updateMediaMix(id, { name: 'Claude plan', goal: genPlan.goal, risk: genPlan.risk, extraChannels: extras.length ? extras : undefined })
  }

  // Render Claude's plan as the same spreadsheet as above: derive CPM/CTR/CVR/Budget/Reach/
  // Conv from its shares and the tool's own benchmarks so the columns match.
  const benchByChannel = new Map(result.allocations.map((a) => [a.channel, a]))
  const genRows = genPlan
    ? [...genPlan.channels]
        .sort((a, b) => b.sharePct - a.sharePct)
        .map((c) => {
          const b = benchByChannel.get(c.channel as ChannelId)
          const kind = (b?.kind ?? 'paid') as keyof typeof DEFAULT_BENCH
          const d = DEFAULT_BENCH[kind] ?? DEFAULT_BENCH.paid
          const cpm = b?.cpm ?? d.cpm
          const ctr = b?.ctr ?? d.ctr
          const cvr = b?.cvr ?? d.cvr
          const dollars = (Math.max(0, c.sharePct) / 100) * mix.budget
          const impressions = cpm > 0 ? (dollars / cpm) * 1000 : 0
          return { channel: c.channel, label: c.label, kind, cpm, ctr, cvr, pct: c.sharePct, dollars, reach: impressions * REACH_FACTOR, conversions: impressions * ctr * cvr, rationale: c.rationale }
        })
    : []

  return (
    <div className="mplan-item">
      <section className="mplan-card">
        <header className="mplan-card-head">
          <div className="mplan-title">
            <span className="mplan-title-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                {ICON}
              </svg>
            </span>
            <input className="mplan-name" value={mix.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Mix name" />
          </div>
        </header>

        <div className="rec-table-wrap">
          <table className="rec-table" style={{ minWidth: 860 }}>
            <thead>
              <tr className="mplan-params-row">
                <th colSpan={10}>
                  <div className="mplan-controls">
                    <label className="mplan-field">
                      <span>Goal</span>
                      <select value={mix.goal} onChange={(e) => patch({ goal: e.target.value as MixGoal })}>
                        {GOALS.map((g) => (
                          <option key={g.k} value={g.k}>{g.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="mplan-field">
                      <span>Budget</span>
                      <div className="mplan-budget">
                        <span>$</span>
                        <input type="number" value={mix.budget} min={0} step={5000} onChange={(e) => patch({ budget: Math.max(0, +e.target.value || 0) })} />
                      </div>
                    </label>
                    <label className="mplan-field">
                      <span>Risk</span>
                      <select value={mix.risk} onChange={(e) => patch({ risk: e.target.value as MixRisk })}>
                        {RISKS.map((r) => (
                          <option key={r.k} value={r.k}>{r.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </th>
              </tr>
              <tr>
                <th style={{ width: 210 }}><span className="rec-th-label">Channel</span></th>
                <th style={{ width: 74 }}><span className="rec-th-label">Type</span></th>
                <th style={{ width: 84 }}><span className="rec-th-label">CPM $</span></th>
                <th style={{ width: 80 }}><span className="rec-th-label">CTR %</span></th>
                <th style={{ width: 80 }}><span className="rec-th-label">CVR %</span></th>
                <th style={{ width: 90 }}><span className="rec-th-label">Mix</span></th>
                <th style={{ width: 100 }}><span className="rec-th-label">Budget</span></th>
                <th style={{ width: 90 }}><span className="rec-th-label">Reach</span></th>
                <th style={{ width: 90 }}><span className="rec-th-label">Conv.</span></th>
                <th className="rec-th-del" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {result.allocations.map((a) => (
                <tr key={a.channel} title={a.rationale}>
                  <td className="rec-td"><span className="mplan-cell-name">{a.label}</span></td>
                  <td className="rec-td"><span className={`mplan-kind k-${a.kind}`}>{a.kind}</span></td>
                  <td className="rec-td"><input className="rec-cell mplan-num" value={a.cpm} onChange={(e) => setBench(a.channel, 'cpm', Math.max(0, +e.target.value || 0))} /></td>
                  <td className="rec-td"><input className="rec-cell mplan-num" value={+(a.ctr * 100).toFixed(2)} onChange={(e) => setBench(a.channel, 'ctr', Math.max(0, (+e.target.value || 0) / 100))} /></td>
                  <td className="rec-td"><input className="rec-cell mplan-num" value={+(a.cvr * 100).toFixed(2)} onChange={(e) => setBench(a.channel, 'cvr', Math.max(0, (+e.target.value || 0) / 100))} /></td>
                  <td className="rec-td mplan-out">
                    {a.kind === 'paid' ? (
                      <div className="mplan-mix">
                        <span className="mplan-mix-bar"><span style={{ width: `${a.pct}%` }} /></span>
                        <span className="mplan-mix-pct">{a.pct}%</span>
                      </div>
                    ) : (
                      <span className="mplan-earned">Earned</span>
                    )}
                  </td>
                  <td className="rec-td mplan-out mplan-money">{a.kind !== 'paid' ? '$0' : a.dollars ? usd(a.dollars) : '—'}</td>
                  <td className="rec-td mplan-out">{a.reach ? fmt(a.reach) : '—'}</td>
                  <td className="rec-td mplan-out">{a.conversions ? fmt(a.conversions) : '—'}</td>
                  <td className="rec-td rec-td-del">
                    {extraIds.has(a.channel) && (
                      <button className="rec-del" title="Remove channel" aria-label="Remove channel" onClick={() => removeChannel(a.channel)}>
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {available.length > 0 && (
                <tr className="rec-add-row">
                  <td colSpan={10} className="rec-add-cell mplan-add-cell">
                    <select
                      className="mplan-addchan"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) addChannel(e.target.value as ChannelId)
                      }}
                    >
                      <option value="">＋ Add a channel…</option>
                      {available.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mplan-card-foot">
          <p className="mplan-foot">
            CPM / CTR / CVR are editable benchmarks. Mix, budget, reach and conversions recompute live, weighted by {brand}&rsquo;s real organic performance.
          </p>
          {canDelete && (
            <button className="mplan-del" onClick={() => deleteMediaMix(mix.id)}>
              Delete mix
            </button>
          )}
        </div>
      </section>

      <section className="mplan-gen">
        <div className="mplan-gen-head">
          <div>
            <h3 className="mplan-gen-title">
              <span className="mplan-gen-spark" aria-hidden="true">✦</span> Generate a mix with Claude
            </h3>
            <p className="mplan-gen-sub">Claude reads {brand}&rsquo;s real Summer performance and proposes a split, weighted toward what already works.</p>
          </div>
          <button className="mplan-gen-btn" onClick={onGenerate} disabled={genLoading}>
            {genLoading ? 'Generating…' : genPlan ? 'Regenerate' : 'Generate with Claude'}
          </button>
        </div>

        {genPlan && (
          <div className="mplan-gen-out">
            <Markdown text={genPlan.summary} className="mplan-gen-summary" />
            <div className="rec-table-wrap mplan-gen-tablewrap">
              <table className="rec-table" style={{ minWidth: 780 }}>
                <thead>
                  <tr>
                    <th style={{ width: 210 }}><span className="rec-th-label">Channel</span></th>
                    <th style={{ width: 74 }}><span className="rec-th-label">Type</span></th>
                    <th style={{ width: 84 }}><span className="rec-th-label">CPM $</span></th>
                    <th style={{ width: 80 }}><span className="rec-th-label">CTR %</span></th>
                    <th style={{ width: 80 }}><span className="rec-th-label">CVR %</span></th>
                    <th style={{ width: 100 }}><span className="rec-th-label">Mix</span></th>
                    <th style={{ width: 100 }}><span className="rec-th-label">Budget</span></th>
                    <th style={{ width: 90 }}><span className="rec-th-label">Reach</span></th>
                    <th style={{ width: 90 }}><span className="rec-th-label">Conv.</span></th>
                  </tr>
                </thead>
                <tbody>
                  {genRows.map((a) => (
                    <tr key={a.channel} title={a.rationale}>
                      <td className="rec-td"><span className="mplan-cell-name">{a.label}</span></td>
                      <td className="rec-td"><span className={`mplan-kind k-${a.kind}`}>{a.kind}</span></td>
                      <td className="rec-td mplan-out mplan-num">{a.cpm}</td>
                      <td className="rec-td mplan-out mplan-num">{+(a.ctr * 100).toFixed(2)}</td>
                      <td className="rec-td mplan-out mplan-num">{+(a.cvr * 100).toFixed(2)}</td>
                      <td className="rec-td mplan-out">
                        {a.kind === 'paid' ? (
                          <div className="mplan-mix">
                            <span className="mplan-mix-bar"><span style={{ width: `${Math.min(100, Math.max(0, a.pct))}%` }} /></span>
                            <span className="mplan-mix-pct">{Math.round(a.pct)}%</span>
                          </div>
                        ) : (
                          <span className="mplan-earned">Earned</span>
                        )}
                      </td>
                      <td className="rec-td mplan-out mplan-money">{a.kind !== 'paid' ? '$0' : a.dollars ? usd(a.dollars) : '—'}</td>
                      <td className="rec-td mplan-out">{a.reach ? fmt(a.reach) : '—'}</td>
                      <td className="rec-td mplan-out">{a.conversions ? fmt(a.conversions) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mplan-gen-foot">
              <span className="mplan-gen-src">{genPlan.live ? 'Generated by Claude from your Summer data' : 'Built from your Summer-backed baseline'}</span>
              <button className="mplan-gen-save" onClick={saveGenAsMix}>Save as new mix</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
