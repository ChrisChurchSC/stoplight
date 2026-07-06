import { money } from '../domain/budget'
import { CHANNELS } from '../domain/channels'
import {
  channelName,
  compact,
  computeAudienceCoverage,
  computeChannelConnection,
  computeLibrarySignals,
  computeMessageCoverage,
  computeMessagingPatterns,
  monthlySeries,
  ratePct,
  reconciliationStat,
  signalRecommendations,
} from '../domain/contentSignals'
import type { ChannelId, TrafficRow } from '../domain/types'
import { ChannelIcon } from './ChannelIcon'
import { TrendChart } from './TrendChart'

/**
 * Signals — the "what's working" read over the ingested library. Ranks content by
 * subscribe rate (not raw reach), surfaces the converting themes + hook patterns, and
 * says what each channel does, so the next campaign is aimed at what grows the audience.
 */

export function LibrarySignals({
  rows,
  subVideos,
  allRows,
  proofPoints,
  ctas,
  audiences,
}: {
  rows: TrafficRow[]
  /** Top subscriber-driving videos, from the brand's measured actuals (Summer). */
  subVideos?: { title: string; subscribers: number; views: number }[]
  /** Every asset the brand has (planned + published), for the channel-mix distribution. */
  allRows?: TrafficRow[]
  /** The brand's defined proof points (RTBs), to check which are actually said in copy. */
  proofPoints?: { label: string }[]
  /** The brand's defined CTAs, to check which asks the copy actually makes. */
  ctas?: { label: string }[]
  /** The brand's defined audiences, to check which the content actually targets. */
  audiences?: { id?: string; name?: string; label?: string; aliases?: string[] }[]
}) {
  const s = computeLibrarySignals(rows)
  const mp = computeMessagingPatterns(rows)
  const cov = computeMessageCoverage(rows, proofPoints ?? [], ctas ?? [])
  const maxCta = Math.max(...cov.cta.items.map((c) => c.hits), 1)
  const maxProofOutcome = Math.max(...cov.proof.performing.map((p) => p.outcome ?? 0), 1)
  const recon = reconciliationStat(allRows ?? rows)
  const conn = computeChannelConnection(rows)
  const aud = computeAudienceCoverage(allRows ?? rows, audiences ?? [])
  const maxAud = Math.max(...aud.defined.map((a) => a.count), 1)
  const recs = signalRecommendations({ coverage: cov, connection: conn, audience: aud, reconcile: recon, signals: s, patterns: mp, takeaways: s.takeaways })
  const KIND_LABEL: Record<string, string> = { fix: 'Fix', amplify: 'Amplify', test: 'Test', setup: 'Set up' }
  const trend = monthlySeries(rows)
  const trendHasSubs = trend.some((p) => p.subs > 0)

  if (!s.converters.length && !s.channels.length) {
    return (
      <div className="mtx-empty">
        Ingest this brand's content first, then Signals reads it for what drives subscribers.
      </div>
    )
  }

  const maxRate = Math.max(...s.converters.map((c) => c.rate ?? 0), 0.00001)
  const maxPatRate = Math.max(...s.patterns.map((p) => p.avgRate), 0.00001)
  const maxLift = Math.max(...s.voice.map((v) => v.lift), 1)
  const maxTopicSubs = Math.max(...s.topics.map((t) => t.subs), 1)
  const maxTopicReach = Math.max(...s.topics.map((t) => t.avgReach), 1)

  // Email subject lines by opens (with click-to-open), from the real published emails.
  const subjectLines = rows
    .filter((r) => r.channel === 'email' && typeof r.socialMetrics?.opens === 'number')
    .map((r) => ({
      id: r.id,
      name: r.assetName,
      opens: r.socialMetrics!.opens as number,
      clicks: typeof r.socialMetrics?.clicks === 'number' ? (r.socialMetrics!.clicks as number) : 0,
    }))
    .sort((a, b) => b.opens - a.opens)
    .slice(0, 6)
  const maxOpens = Math.max(...subjectLines.map((o) => o.opens), 1)

  // Channel mix — assets and spend by channel across the brand's whole plan.
  const channelMix = (() => {
    if (!allRows?.length) return []
    const map = new Map<string, { channel: string; assets: Set<string>; eng: number; spend: number }>()
    for (const r of allRows) {
      const ch = String(r.channel)
      const cur = map.get(ch) ?? { channel: ch, assets: new Set<string>(), eng: 0, spend: 0 }
      cur.assets.add(r.assetName)
      cur.eng += r.engagement ? r.engagement.likes + r.engagement.comments : 0
      cur.spend += r.spend?.toDate ?? 0
      map.set(ch, cur)
    }
    return [...map.values()]
      .map((c) => ({
        channel: c.channel,
        label: CHANNELS[c.channel as ChannelId]?.label ?? c.channel,
        assets: c.assets.size,
        eng: c.eng,
        spend: c.spend,
      }))
      .sort((a, b) => b.assets - a.assets)
  })()
  const maxMixAssets = Math.max(1, ...channelMix.map((c) => c.assets))

  return (
    <div className="sig">
      {recs.length > 0 && (
        <section className="ins-card ins-wide sig-recs">
          <div className="ins-card-head">
            <h3>Recommendations</h3>
            <span className="ins-card-hint">fix the leaks, amplify what converts, read off the signals below</span>
          </div>
          <div className="sig-rec-list">
            {recs.map((r, i) => (
              <div className="sig-rec" key={i}>
                <span className={`sig-rec-tag ${r.kind}`}>{KIND_LABEL[r.kind]}</span>
                <span className="sig-rec-text">{r.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {trend.length >= 2 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Reach & subscribers over time</h3>
            <span className="ins-card-hint">monthly, across every dated post — what was working, and when</span>
          </div>
          <TrendChart
            labels={trend.map((p) => p.label)}
            series={[
              { name: 'Reach', values: trend.map((p) => p.reach), color: 'var(--accent-3)', area: true, format: compact },
              ...(trendHasSubs
                ? [{ name: 'Subscribers', values: trend.map((p) => p.subs), color: 'var(--accent-2)' }]
                : []),
            ]}
          />
        </section>
      )}

      {s.converters.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>What converts to subscribers</h3>
            <span className="ins-card-hint">ranked by subscribe rate, not raw views</span>
          </div>
          <div className="sig-conv">
            {s.converters.map((c) => (
              <div className="sig-conv-row" key={c.id}>
                <span className="sig-conv-title" title={c.title}>
                  {c.title}
                </span>
                <span className="sig-conv-bar">
                  <span className="sig-conv-fill" style={{ width: `${Math.round(((c.rate ?? 0) / maxRate) * 100)}%` }} />
                </span>
                <span className="sig-conv-rate">{ratePct(c.rate ?? 0)}</span>
                <span className="sig-conv-nums">
                  +{c.subs} subs · {compact(c.reach)} {c.reachLabel}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {subVideos && subVideos.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Top subscriber-driving videos</h3>
            <span className="ins-card-hint">which content converts viewers to subscribers</span>
          </div>
          <div className="mtx-vids">
            {subVideos.map((v) => (
              <div className="mtx-vid" key={v.title}>
                <span className="mtx-vid-title" title={v.title}>
                  {v.title}
                </span>
                <span className="mtx-vid-subs">+{v.subscribers} subs</span>
                <span className="mtx-vid-rate">
                  {(v.views ? (v.subscribers / v.views) * 100 : 0).toFixed(1)}% of {compact(v.views)} views
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {subjectLines.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Subject lines that pulled</h3>
            <span className="ins-card-hint">emails ranked by opens · click-to-open</span>
          </div>
          <div className="sig-conv">
            {subjectLines.map((e) => (
              <div className="sig-conv-row" key={e.id}>
                <span className="sig-conv-title" title={e.name}>
                  {e.name}
                </span>
                <span className="sig-conv-bar">
                  <span className="sig-conv-fill" style={{ width: `${Math.round((e.opens / maxOpens) * 100)}%` }} />
                </span>
                <span className="sig-conv-rate">{compact(e.opens)}</span>
                <span className="sig-conv-nums">
                  {e.opens > 0 ? `${Math.round((e.clicks / e.opens) * 100)}% click-to-open` : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {s.patterns.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Patterns in what converts</h3>
            <span className="ins-card-hint">title shape vs subscribe rate</span>
          </div>
          <div className="sig-conv">
            {s.patterns.map((p) => (
              <div className="sig-conv-row" key={p.shape}>
                <span className="sig-conv-title">
                  {p.shape} <em className="sig-pat-n">×{p.count}</em>
                </span>
                <span className="sig-conv-bar">
                  <span className="sig-conv-fill" style={{ width: `${Math.round((p.avgRate / maxPatRate) * 100)}%` }} />
                </span>
                <span className="sig-conv-rate">{ratePct(p.avgRate)}</span>
                <span className="sig-conv-nums">{compact(p.avgReach)} avg views</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {s.voice.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>How the writing works</h3>
            <span className="ins-card-hint">voice traits vs the brand's average reach</span>
          </div>
          <div className="sig-conv">
            {s.voice.map((v) => (
              <div className="sig-conv-row" key={v.trait}>
                <span className="sig-conv-title">
                  {v.trait} <em className="sig-pat-n">×{v.count}</em>
                </span>
                <span className="sig-conv-bar">
                  <span className="sig-conv-fill" style={{ width: `${Math.min(100, Math.round((v.lift / maxLift) * 100))}%` }} />
                </span>
                <span className={`sig-conv-rate${v.lift >= 1 ? '' : ' down'}`}>
                  {v.lift >= 1 ? '+' : ''}
                  {Math.round((v.lift - 1) * 100)}%
                </span>
                <span className="sig-conv-nums">{compact(v.avgReach)} avg reach</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {s.topics.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Topics that convert</h3>
            <span className="ins-card-hint">subject clusters by subscribers driven (heuristic)</span>
          </div>
          <div className="sig-conv">
            {s.topics.map((t) => (
              <div className="sig-conv-row" key={t.topic}>
                <span className="sig-conv-title" title={t.examples.join(' · ')}>
                  {t.topic} <em className="sig-pat-n">×{t.count}</em>
                </span>
                <span className="sig-conv-bar">
                  <span
                    className="sig-conv-fill"
                    style={{
                      width: `${Math.round((maxTopicSubs > 1 ? t.subs / maxTopicSubs : t.avgReach / maxTopicReach) * 100)}%`,
                    }}
                  />
                </span>
                <span className="sig-conv-rate">{t.subs > 0 ? `+${t.subs}` : ratePct(t.avgRate)}</span>
                <span className="sig-conv-nums">{compact(t.avgReach)} avg reach</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(s.lengthBands.length > 0 || s.openers.length > 0) && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Title length & openers</h3>
            <span className="ins-card-hint">what shape of title travels</span>
          </div>
          <div className="sig-two">
            {s.lengthBands.length > 0 && (
              <div className="sig-two-col">
                <div className="sig-two-h">Length vs reach</div>
                {s.lengthBands.map((b) => (
                  <div className="sig-mini-row" key={b.band}>
                    <span>{b.band}</span>
                    <b>{compact(b.avgReach)}</b>
                    <em>×{b.count}</em>
                  </div>
                ))}
              </div>
            )}
            {s.openers.length > 0 && (
              <div className="sig-two-col">
                <div className="sig-two-h">Opens with</div>
                {s.openers.map((o) => (
                  <div className="sig-mini-row" key={o.word}>
                    <span>“{o.word}”</span>
                    <b>{compact(o.avgReach)}</b>
                    <em>×{o.count}</em>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {s.asks.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>The ask</h3>
            <span className="ins-card-hint">
              CTAs pulled from body copy ({s.bodyCoverage.withCopy} of {s.bodyCoverage.total} carry copy)
            </span>
          </div>
          <div className="sig-themes">
            {s.asks.map((a) => (
              <span className="sig-theme" key={a.ask} title={a.examples.join(' · ')}>
                {a.ask}
                <b>×{a.count}</b>
              </span>
            ))}
          </div>
        </section>
      )}

      {s.vocabulary.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Signature language</h3>
            <span className="ins-card-hint">phrases that recur across the library</span>
          </div>
          <div className="sig-themes">
            {s.vocabulary.map((p) => (
              <span className="sig-theme" key={p.phrase}>
                {p.phrase}
                <b>×{p.count}</b>
              </span>
            ))}
          </div>
        </section>
      )}

      {mp.surfaces.length >= 2 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Language by surface</h3>
            <span className="ins-card-hint">how the copy reads on each channel type</span>
          </div>
          <div className="sig-two">
            {mp.surfaces.map((su) => (
              <div className="sig-two-col" key={su.surface}>
                <div className="sig-two-h">
                  {su.surface} · {su.assets} {su.assets === 1 ? 'asset' : 'assets'}
                </div>
                <div className="sig-mini-row">
                  <span>First person “we / our”</span>
                  <b>{su.firstPersonPct}%</b>
                  <em>{su.firstPersonN}</em>
                </div>
                <div className="sig-mini-row">
                  <span>Speaks to “you”</span>
                  <b>{su.youPct}%</b>
                  <em>{su.youN}</em>
                </div>
                <div className="sig-mini-row">
                  <span>Asks a question</span>
                  <b>{su.questionPct}%</b>
                  <em>{su.questionN}</em>
                </div>
                <div className="sig-mini-row">
                  <span>Defines “X is a…”</span>
                  <b>{su.definitionalPct}%</b>
                  <em>{su.definitionalN}</em>
                </div>
                <div className="sig-mini-row">
                  <span>Avg length</span>
                  <b>{su.avgWords}w</b>
                  <em />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {mp.sole.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Said on one surface only</h3>
            <span className="ins-card-hint">vocabulary that lives on a single channel type</span>
          </div>
          <div className="sig-two">
            {mp.surfaces
              .filter((su) => mp.sole.some((t) => t.surface === su.surface))
              .map((su) => (
                <div className="sig-two-col" key={su.surface}>
                  <div className="sig-two-h">{su.surface}</div>
                  <div className="sig-themes">
                    {mp.sole
                      .filter((t) => t.surface === su.surface)
                      .map((t) => (
                        <span className="sig-theme" key={t.phrase}>
                          {t.phrase}
                          <b>×{t.count}</b>
                        </span>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {mp.repeats.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Repeated word for word</h3>
            <span className="ins-card-hint">identical copy reused across assets</span>
          </div>
          <div className="sig-conv">
            {mp.repeats.map((rp, i) => (
              <div className="sig-conv-row" key={i}>
                <span className="sig-conv-title" title={rp.text}>
                  {rp.text.length > 76 ? `${rp.text.slice(0, 76)}…` : rp.text}
                </span>
                <span className="sig-conv-bar">
                  <span
                    className="sig-conv-fill"
                    style={{ width: `${Math.round((rp.count / (mp.repeats[0]?.count || 1)) * 100)}%` }}
                  />
                </span>
                <span className="sig-conv-rate">×{rp.count}</span>
                <span className="sig-conv-nums">{rp.surface}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {cov.proof.total > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Proof points in play</h3>
            <span className="ins-card-hint">
              {cov.proof.used} of {cov.proof.total} brand proof points appear in the copy
            </span>
          </div>
          {cov.proof.unused.length > 0 ? (
            <>
              <p className="sig-note">
                Defined in the brand system but never stated in a post or page, so no one reading the messaging
                would know:
              </p>
              <div className="sig-themes">
                {cov.proof.unused.slice(0, 18).map((p) => (
                  <span className="sig-theme sig-theme-warn" key={p.label}>
                    {p.label}
                  </span>
                ))}
              </div>
              {cov.proof.unused.length > 18 && (
                <p className="sig-note">+{cov.proof.unused.length - 18} more not yet used in any copy.</p>
              )}
            </>
          ) : (
            <p className="sig-note">Every defined proof point shows up somewhere in the copy.</p>
          )}
          {cov.proof.performing.length > 0 && (
            <>
              <p className="sig-note">
                Of the proof points you do use, ranked by what the content carrying them actually drove (calibrated on
                real metrics, not a guess):
              </p>
              <div className="sig-conv">
                {cov.proof.performing.slice(0, 6).map((p) => (
                  <div className="sig-conv-row" key={p.label}>
                    <span className="sig-conv-title" title={p.label}>
                      {p.label}
                    </span>
                    <span className="sig-conv-bar">
                      <span
                        className="sig-conv-fill"
                        style={{ width: `${Math.round(((p.outcome ?? 0) / maxProofOutcome) * 100)}%` }}
                      />
                    </span>
                    <span className="sig-conv-rate">{compact(p.outcome ?? 0)}</span>
                    <span className="sig-conv-nums">
                      drove, across {p.hits} {p.hits === 1 ? 'asset' : 'assets'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {recon.planned > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Plan vs actual</h3>
            <span className="ins-card-hint">
              {recon.reconciled} of {recon.planned} planned assets reconciled to their live post
            </span>
          </div>
          <p className="sig-note">
            When a planned card ships, it reconciles to the real post by its link or copy and inherits the measured
            metrics, the projection becomes the actual.
            {recon.reconciled === 0 ? ' None have reconciled yet; they will as cards go live and match a published post.' : ''}
          </p>
        </section>
      )}

      {cov.cta.total > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Are you making the ask?</h3>
            <span className="ins-card-hint">how often the copy actually says each defined CTA</span>
          </div>
          <div className="sig-conv">
            {cov.cta.items.map((c) => (
              <div className="sig-conv-row" key={c.label}>
                <span className="sig-conv-title">{c.label}</span>
                <span className="sig-conv-bar">
                  <span className="sig-conv-fill" style={{ width: `${Math.round((c.hits / maxCta) * 100)}%` }} />
                </span>
                <span className={`sig-conv-rate${c.hits === 0 ? ' down' : ''}`}>{c.hits === 0 ? 'never' : c.hits}</span>
                <span className="sig-conv-nums">
                  {c.hits === 0 ? 'defined, never said' : `of ${cov.corpusAssets} assets`}
                </span>
              </div>
            ))}
          </div>
          <p className="sig-note">
            An ask the copy never makes can't convert. If a channel's goal is subscribers but no post says
            "subscribe", the audience has no way to know to.
          </p>
        </section>
      )}

      {conn.channels.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Do the channels connect?</h3>
            <span className="ins-card-hint">
              {conn.overall.connected} of {conn.overall.total} posts point to a next step · {conn.overall.deadEndPct}%
              dead ends
            </span>
          </div>
          <div className="sig-conv">
            {conn.channels.map((c) => {
              const pct = c.total ? Math.round((c.connected / c.total) * 100) : 0
              return (
                <div className="sig-conv-row" key={c.channel}>
                  <span className="sig-conv-title">{c.label}</span>
                  <span className="sig-conv-bar">
                    <span className="sig-conv-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className={`sig-conv-rate${c.connected === 0 ? ' down' : ''}`}>{pct}%</span>
                  <span className="sig-conv-nums">
                    {c.destinations.length ? `→ ${c.destinations.slice(0, 3).map((d) => d.key).join(', ')}` : 'dead end'}
                  </span>
                </div>
              )
            })}
          </div>
          {conn.destRank.length > 0 && (
            <>
              <p className="sig-note">Where the copy sends people:</p>
              <div className="sig-themes">
                {conn.destRank.map((d) => (
                  <span className="sig-theme" key={d.key}>
                    {d.key}
                    <b>×{d.count}</b>
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {audiences && audiences.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Audience coverage</h3>
            <span className="ins-card-hint">
              {aud.tagged} of {aud.total} assets name an audience
            </span>
          </div>
          <div className="sig-conv">
            {aud.defined.map((a) => (
              <div className="sig-conv-row" key={a.label}>
                <span className="sig-conv-title">{a.label}</span>
                <span className="sig-conv-bar">
                  <span className="sig-conv-fill" style={{ width: `${Math.round((a.count / maxAud) * 100)}%` }} />
                </span>
                <span className={`sig-conv-rate${a.count === 0 ? ' down' : ''}`}>{a.count === 0 ? 'none' : a.count}</span>
                <span className="sig-conv-nums">{a.count === 0 ? 'defined, no content' : 'assets'}</span>
              </div>
            ))}
          </div>
          {aud.offList.length > 0 && (
            <>
              <p className="sig-note">Content targets these audiences that aren't in the brand's defined set:</p>
              <div className="sig-themes">
                {aud.offList.slice(0, 14).map((o) => (
                  <span className="sig-theme sig-theme-warn" key={o.label}>
                    {o.label}
                    <b>×{o.count}</b>
                  </span>
                ))}
              </div>
            </>
          )}
          {aud.untagged > 0 && <p className="sig-note">{aud.untagged} assets name no audience at all.</p>}
        </section>
      )}

      {(s.cadence.length > 0 || s.days.length > 0) && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Cadence & timing</h3>
          </div>
          <div className="sig-cadence">
            {s.cadence.length > 0 && <div className="sig-cad-line">Publishes {s.cadence.join(', ')}</div>}
            {s.days.length > 0 && (
              <div className="sig-days">
                {s.days.slice(0, 4).map((d) => (
                  <span className="sig-day" key={d.day}>
                    {d.day}
                    <b>{compact(d.avgReach)}</b>
                    <em>×{d.count}</em>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {s.themes.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Themes that convert</h3>
            <span className="ins-card-hint">title terms weighted by subscribers driven</span>
          </div>
          <div className="sig-themes">
            {s.themes.map((t) => (
              <span className="sig-theme" key={t.term}>
                {t.term}
                <b>+{t.subs}</b>
              </span>
            ))}
          </div>
        </section>
      )}

      {s.channels.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>What each channel does</h3>
          </div>
          <div className="sig-channels">
            {s.channels.map((c) => (
              <div className="sig-ch-row" key={c.channel}>
                <span className="sig-ch-name">
                  <ChannelIcon channel={c.channel as ChannelId} size={15} />
                  {channelName(c.channel)}
                </span>
                <span className={`sig-ch-role${c.subs > 0 ? ' engine' : ''}`}>{c.role}</span>
                <span className="sig-ch-nums">
                  {c.count} {c.count === 1 ? 'post' : 'posts'} · {compact(c.reach)} {c.reachLabel}
                  {c.subs > 0 ? ` · +${c.subs} subs` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {channelMix.length > 0 && (
        <section className="ins-card ins-wide">
          <div className="ins-card-head">
            <h3>Channel mix</h3>
            <span className="ins-card-hint">assets and spend by channel</span>
          </div>
          <div className="sig-conv">
            {channelMix.map((c) => (
              <div className="sig-conv-row" key={c.channel}>
                <span className="sig-conv-title">{c.label}</span>
                <span className="sig-conv-bar">
                  <span className="sig-conv-fill" style={{ width: `${Math.round((c.assets / maxMixAssets) * 100)}%` }} />
                </span>
                <span className="sig-conv-rate">{c.assets}</span>
                <span className="sig-conv-nums">
                  {[c.spend > 0 ? `${money(c.spend)} spend` : null, c.eng > 0 ? `${compact(c.eng)} eng` : null]
                    .filter(Boolean)
                    .join(' · ') || `asset${c.assets === 1 ? '' : 's'}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mtx-foot">
        A read over the ingested library. It separates reach from conversion: the posts that get the most
        views usually are not the ones that grow the audience. Rank by subscribe rate to see what to make
        more of. These reads are heuristic (keyword and metric based); for a nuanced pass (provocation,
        refined topics, subject-line rewrites) ask Claude to analyze the library, it reads the copy directly.
      </div>
    </div>
  )
}
