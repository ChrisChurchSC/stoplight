import { useState } from 'react'
import { diagnose, scatterMap, structuredMap } from '../domain/diagnosis'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'

const MAP_W = 640
const MAP_H = 300
const STAGES = ['Awareness', 'Consideration', 'Conversion', 'Retention']

/**
 * Onboarding-as-diagnosis. Two acts on the brand's own data: the mess that's
 * live right now (assets floating, contradictions, no plan behind them), then the
 * same map connected. Their problem, then their problem solved. The villain is
 * the scale problem, not them — diagnose, don't insult — and every number is real
 * (drawn from the live connection check), so it's credible.
 */
export function DiagnosisOverlay() {
  const open = useTrafficStore((s) => s.diagnosisOpen)
  const closeStore = useTrafficStore((s) => s.closeDiagnosis)
  const setView = useTrafficStore((s) => s.setView)
  const rows = useTrafficStore((s) => s.rows)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const [act, setAct] = useState<1 | 2>(1)

  if (!open) return null
  const close = () => {
    setAct(1)
    closeStore()
  }
  const scoped = rows.filter((r) => rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }))
  const f = diagnose(scoped, breakStatus, campaignList)
  const client = clientFilter !== 'all' ? clientFilter : 'your brand'
  const scatter = scatterMap(scoped, MAP_W, MAP_H, breakStatus)
  const structured = structuredMap(scoped, MAP_W, MAP_H, breakStatus)
  const hubX = MAP_W / 2
  const hubY = 16

  // Only ever surface a problem we can actually point to. Bad-stat cards that are
  // zero are dropped; if the campaign is mostly clean we pad with neutral context
  // (real counts) rather than invent a flaw. The connect ratio always anchors.
  const cards: { n: number | string; label: string; bad?: boolean }[] = [
    { n: f.contradictions, label: 'contradictions across variants', bad: true },
    { n: f.unsupported, label: 'claims with no proof behind them', bad: true },
    { n: f.offBrand, label: 'lines off your brand voice', bad: true },
    { n: f.noStrategy, label: 'assets with no plan behind them', bad: true },
  ].filter((c) => (c.n as number) > 0)
  cards.length = Math.min(cards.length, 3)
  const fill = [
    { n: f.audiences, label: 'audiences in flight' },
    { n: f.totalAssets, label: 'live assets in market' },
  ]
  for (let i = 0; cards.length < 3 && i < fill.length; i++) cards.push(fill[i])
  cards.push({ n: `${f.connected}/${f.totalAssets}`, label: 'actually connect' })

  return (
    <>
      <div className="dg-scrim" onClick={close} />
      <div className="dg" role="dialog" aria-label="Campaign diagnosis">
        <button className="dg-x" onClick={close}>
          ✕
        </button>

        {act === 1 ? (
          <div className="dg-act">
            <div className="dg-kicker">The diagnosis · {client}</div>
            <h2 className="dg-head">
              {f.verdict === 'sharp'
                ? `This is what's live right now — and no one could see it.`
                : `Here's your messaging, mapped.`}
            </h2>
            <p className="dg-frame">
              Not a you problem. It's what happens to everyone when personalization scales faster than
              connection — no one can see across {f.totalAssets} assets and {f.audiences} audiences at
              once. Until now.
            </p>

            <div className="dg-map-wrap">
              <svg width={MAP_W} height={MAP_H} className="dg-map">
                {scatter.map((d) => (
                  <circle key={d.id} cx={d.x} cy={d.y} r={7} className={`dg-dot${d.flagged ? ' flagged' : ''}`}>
                    <title>{d.label}</title>
                  </circle>
                ))}
              </svg>
              <span className="dg-map-cap">Live now: {f.totalAssets} assets, floating. No thread between them.</span>
            </div>

            <div className="dg-stats">
              {cards.map((c, i) => (
                <div key={i} className={`dg-stat${c.bad ? ' bad' : ''}`}>
                  <span className="dg-stat-n">{c.n}</span>
                  {c.label}
                </div>
              ))}
            </div>

            <div className="dg-foot">
              <span className="dg-foot-note">Every number is from your own live messaging.</span>
              <span className="spacer" />
              <button className="btn primary" onClick={() => setAct(2)}>
                Now here's it connected →
              </button>
            </div>
          </div>
        ) : (
          <div className="dg-act">
            <div className="dg-kicker ok">The resolution · {client}</div>
            <h2 className="dg-head">The same campaign, connected.</h2>
            <p className="dg-frame">
              Every message tied to its audience and strategy, laid out by journey stage, every
              contradiction caught in place. Same assets. One thread.
            </p>

            <div className="dg-map-wrap">
              <svg width={MAP_W} height={MAP_H} className="dg-map connected">
                {STAGES.map((s, i) => (
                  <text key={s} x={(i + 0.5) * (MAP_W / 4)} y={MAP_H - 8} className="dg-stage-label">
                    {s}
                  </text>
                ))}
                {structured.map((d) => (
                  <line key={`l-${d.id}`} x1={hubX} y1={hubY + 8} x2={d.x} y2={d.y} className={`dg-link${d.flagged ? ' flagged' : ''}`} />
                ))}
                <rect x={hubX - 44} y={hubY} width={88} height={18} rx={4} className="dg-hub" />
                <text x={hubX} y={hubY + 13} className="dg-hub-label">
                  Strategy
                </text>
                {structured.map((d) => (
                  <circle key={d.id} cx={d.x} cy={d.y} r={7} className={`dg-dot connected${d.flagged ? ' flagged' : ''}`}>
                    <title>{d.label}</title>
                  </circle>
                ))}
              </svg>
              <span className="dg-map-cap ok">Connected: every asset tied up to its audience and the plan.</span>
            </div>

            <p className="dg-punch">
              The gap between these two pictures is the whole reason to use Hyperfocus. This is what's
              live, and this is what it looks like connected.
            </p>

            <div className="dg-foot">
              <button className="btn sm" onClick={() => setAct(1)}>
                ← Back to the diagnosis
              </button>
              <span className="spacer" />
              <button
                className="btn primary"
                onClick={() => {
                  setView('flow')
                  close()
                }}
              >
                See it on the canvas →
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
