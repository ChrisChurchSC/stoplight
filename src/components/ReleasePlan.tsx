import { useMemo, useState } from 'react'
import { campaignFlight } from '../domain/campaignWindow'
import { formatReach, journeyPerformance } from '../domain/journeyPerf'
import { buildReleaseBoard, weekStart, type ReleaseCampaign, type ReleaseItem } from '../domain/releasePlan'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { DRAFTS_SPACE, useTrafficStore } from '../store/useTrafficStore'

/**
 * Launch queue — stage the whole portfolio into paced release waves instead of shipping
 * everything at once. Each campaign lands in the week of its flight window; a cadence
 * cap keeps a week from overloading. Every item shows how ready it is to go, so the plan
 * is both a schedule and a readiness board. A row opens the campaign canvas.
 */

const DAY = 86_400_000
const WEEK = 7 * DAY
const MNAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDay = (ms: number) => {
  const d = new Date(ms)
  return `${MNAMES[d.getMonth()]} ${d.getDate()}`
}

export function ReleasePlan() {
  const { canvases } = useHomeCanvases()
  const openReview = useTrafficStore((s) => s.openReview)

  const [cap, setCap] = useState(3)
  const now = Date.now()

  const campaigns = useMemo<ReleaseCampaign[]>(
    () =>
      canvases
        .filter((c) => c.client && c.client !== DRAFTS_SPACE)
        .map((c) => {
          const flight = campaignFlight(c.name, c.rows)
          const jp = journeyPerformance(c.rows)
          return {
            name: c.name,
            brand: c.client,
            label: c.name.startsWith(`${c.client} — `) ? c.name.slice(c.client.length + 3) : c.name,
            status: c.status,
            reach: jp.plan.topReach,
            toConversion: jp.plan.toConversion,
            start: flight?.start ?? null,
            end: flight?.end ?? null,
            approved: c.rows.filter((r) => r.status === 'approved').length,
            total: c.rows.length,
            highFlags: c.attention.flags.filter((f) => f.severity === 'high').length,
          }
        }),
    [canvases],
  )

  const board = buildReleaseBoard(campaigns, cap, now)
  const thisWeek = weekStart(now)
  const waveLabel = (wk: number) => {
    const w = Math.round((wk - thisWeek) / WEEK)
    if (w <= 0) return 'This week'
    if (w === 1) return 'Next week'
    return `Week of ${fmtDay(wk)}`
  }
  const waveAway = (wk: number) => {
    const w = Math.round((wk - thisWeek) / WEEK)
    return w <= 1 ? '' : `in ${w}w`
  }

  // From the launch queue the intent is readiness, so a row opens the first asset still
  // awaiting sign-off straight into the review drawer — as an overlay ON the queue. No
  // jump into the campaign workspace, so the side nav and your place in the queue stay put.
  const open = (name: string) => {
    const cv = canvases.find((c) => c.name === name)
    const target =
      cv?.rows.find((r) => r.status !== 'approved' && r.status !== 'scheduled' && r.status !== 'posted') ?? cv?.rows[0]
    if (target) openReview(target.id)
  }

  const next = board.waves[0]
  const KPIS = [
    { label: 'In queue', value: String(board.total - board.undated.length), sub: `${board.undated.length} undated` },
    { label: 'Ready to launch', value: String(board.readyCount), sub: `${board.needsWorkCount} need work` },
    {
      label: 'Next wave',
      value: next ? `${next.items.length}` : '—',
      sub: next ? `${waveLabel(next.weekStart).toLowerCase()} · ${formatReach(next.reach)}` : 'nothing dated',
    },
    { label: 'Cadence', value: `${cap}/wk`, sub: 'max launches per wave' },
  ]

  return (
    <div className="rel">
      <header className="rel-head">
        <div>
          <h1 className="rel-title">Release plan</h1>
          <p className="rel-sub">
            {board.total} campaign{board.total === 1 ? '' : 's'} staged into waves, released at a pace the audience can
            absorb.
          </p>
        </div>
        <label className="rel-cadence">
          Max launches / week
          <input
            type="number"
            min={1}
            max={20}
            value={cap}
            onChange={(e) => setCap(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          />
        </label>
      </header>

      <div className="ins-kpis rel-kpis">
        {KPIS.map((k) => (
          <div className="ins-kpi" key={k.label}>
            <span className="ins-kpi-label">{k.label}</span>
            <span className="ins-kpi-value">{k.value}</span>
            <span className="ins-kpi-sub">{k.sub}</span>
          </div>
        ))}
      </div>

      {board.waves.length === 0 && board.undated.length === 0 ? (
        <div className="rel-empty">No campaigns to stage yet.</div>
      ) : (
        <div className="rel-waves">
          {board.waves.map((w) => (
            <section className="rel-wave" key={w.weekStart}>
              <div className="rel-wave-head">
                <span className="rel-wave-when">{waveLabel(w.weekStart)}</span>
                <span className="rel-wave-meta">
                  {waveAway(w.weekStart) && <span className="rel-wave-away">{waveAway(w.weekStart)}</span>}
                  {w.ready}/{w.items.length} ready · {formatReach(w.reach)} reach
                </span>
              </div>
              {w.items.map((it) => (
                <ReleaseRow key={it.name} item={it} onOpen={() => open(it.name)} />
              ))}
            </section>
          ))}

          {board.undated.length > 0 && (
            <section className="rel-wave rel-backlog">
              <div className="rel-wave-head">
                <span className="rel-wave-when">Backlog</span>
                <span className="rel-wave-meta">no flight window set</span>
              </div>
              {board.undated.map((it) => (
                <ReleaseRow key={it.name} item={it} onOpen={() => open(it.name)} />
              ))}
            </section>
          )}
        </div>
      )}

      <div className="rel-foot">
        Campaigns slot into the week of their flight window. When a week hits the cap, the lowest-reach overflow
        staggers to the next open week (marked "bumped"). Readiness is approval plus coherence, so a slot can be
        scheduled before it's clear to go.
      </div>
    </div>
  )
}

function ReleaseRow({ item, onOpen }: { item: ReleaseItem; onOpen: () => void }) {
  return (
    <div className="rel-row" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <span className="rel-row-name" title={item.name}>
        {item.label}
        {item.bumped && <span className="rel-bumped">bumped</span>}
      </span>
      <span className="rel-row-brand">{item.brand}</span>
      <span className="rel-row-ready">
        <span className="ins-bar">
          <span className="ins-bar-fill" style={{ width: `${Math.round(item.readiness * 100)}%` }} />
        </span>
        <span className="rel-row-ready-n">
          {item.approved}/{item.total}
        </span>
      </span>
      <span className="rel-row-reach">{formatReach(item.reach)}</span>
      <span className="rel-row-gate">
        {item.launchReady ? (
          <span className="rel-go">✓ clear to launch</span>
        ) : (
          item.reasons.map((r) => (
            <span key={r} className="rel-reason">
              {r}
            </span>
          ))
        )}
      </span>
    </div>
  )
}
