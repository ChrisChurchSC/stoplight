import { useEffect, useMemo } from 'react'
import { CHANNELS } from '../domain/channels'
import { recommendChannelMix, BENCH_CHANNEL_IDS, type ChannelPerf, type MediaMix, type MixChannel, type MixGoal, type MixRisk } from '../domain/channelMix'
import type { ChannelId } from '../domain/types'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'

const DEFAULT_BENCH = {
  paid: { cpm: 15, ctr: 0.008, cvr: 0.015 },
  organic: { cpm: 5, ctr: 0.012, cvr: 0.01 },
  owned: { cpm: 2, ctr: 0.025, cvr: 0.04 },
} as const

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
      <header className="rec-head">
        <div className="rec-title">
          <span className="rec-title-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              {ICON}
            </svg>
          </span>
          Media mixes
        </div>
        <button className="rec-new" onClick={() => addMediaMix(brand)}>
          + New mix
        </button>
      </header>

      <div className="rec-sub">
        <span className="rec-sub-count">
          {brandMixes.length} {brandMixes.length === 1 ? 'mix' : 'mixes'}
        </span>
        <span className="rec-sub-sort">Weighted by real performance</span>
      </div>

      {brandMixes.map((m) => (
        <MediaMixCard key={m.id} mix={m} brand={brand} perf={perf} canDelete={brandMixes.length > 1} />
      ))}
    </div>
  )
}

function MediaMixCard({ mix, brand, perf, canDelete }: { mix: MediaMix; brand: string; perf: ChannelPerf[]; canDelete: boolean }) {
  const updateMediaMix = useTrafficStore((s) => s.updateMediaMix)
  const deleteMediaMix = useTrafficStore((s) => s.deleteMediaMix)

  const result = useMemo(
    () => recommendChannelMix({ goal: mix.goal, budget: mix.budget, risk: mix.risk, perf, overrides: mix.overrides, extraChannels: mix.extraChannels, hiddenChannels: mix.hiddenChannels }),
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
    // Re-adding a default benchmark channel just unhides it (restoring its real benchmark).
    if (BENCH_CHANNEL_IDS.includes(id)) {
      patch({ hiddenChannels: (mix.hiddenChannels ?? []).filter((h) => h !== id) })
      return
    }
    const d = DEFAULT_BENCH[c.kind]
    const mc: MixChannel = { channel: id, label: c.label, kind: c.kind, cpm: d.cpm, ctr: d.ctr, cvr: d.cvr, provenFrom: [id] }
    patch({ extraChannels: [...(mix.extraChannels ?? []), mc] })
  }
  // Remove a channel: drop a user-added one, or hide a default benchmark one.
  const removeChannel = (id: ChannelId) => {
    if (extraIds.has(id)) {
      patch({ extraChannels: (mix.extraChannels ?? []).filter((c) => c.channel !== id) })
    } else {
      patch({ hiddenChannels: [...(mix.hiddenChannels ?? []), id] })
    }
  }

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
                    <button className="rec-del" title="Remove channel" aria-label="Remove channel" onClick={() => removeChannel(a.channel)}>
                      ✕
                    </button>
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
    </div>
  )
}
