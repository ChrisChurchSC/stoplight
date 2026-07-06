import { useEffect, useMemo, useState } from 'react'
import type { Competitor } from '../domain/clients'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Landscape — who the brand is really up against, for attention and for answers, and the
 * wedge it owns that none of them do. A brand-system INPUT (you define it), not a metrics
 * read: it has no connected data source yet, so it's honest about being your own call. What
 * you put here sharpens the reads that do have data: AEO answers can be written against the
 * incumbent, and Signals can flag your one true differentiator. Lives beside About / Voice /
 * Messaging because it's a standing fact about the brand, not a campaign artifact.
 */

const KINDS: { key: NonNullable<Competitor['kind']>; label: string; hint: string }[] = [
  { key: 'answer', label: 'Answer', hint: 'owns the search / answer-engine real estate for your questions' },
  { key: 'attention', label: 'Attention', hint: 'wins your audience’s watch-time on adjacent topics' },
  { key: 'model', label: 'Model', hint: 'the closest direct analog to what you actually do' },
]
const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.key, k.label]))

function blank(): Competitor {
  return { name: '', kind: 'answer', what: '', strength: '', gap: '', url: '' }
}

export function LandscapeView({ brand }: { brand: string }) {
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)

  const [wedge, setWedge] = useState('')
  const [rows, setRows] = useState<Competitor[]>([])
  const [dirty, setDirty] = useState(false)

  // Seed from the stored profile when the brand changes (not on every write, so an
  // in-progress edit isn't clobbered).
  useEffect(() => {
    const p = clientProfiles[brand] ?? {}
    setWedge(p.wedge ?? '')
    setRows((p.competitors ?? []).map((c) => ({ ...blank(), ...c })))
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand])

  const update = (i: number, patch: Partial<Competitor>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
    setDirty(true)
  }
  const add = () => {
    setRows((prev) => [...prev, blank()])
    setDirty(true)
  }
  const remove = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  const save = () => {
    const competitors: Competitor[] = rows
      .map((r) => ({
        name: r.name.trim(),
        kind: r.kind,
        what: r.what?.trim() || undefined,
        strength: r.strength?.trim() || undefined,
        gap: r.gap?.trim() || undefined,
        url: r.url?.trim() || undefined,
      }))
      .filter((r) => r.name)
    setClientProfile(brand, { competitors, wedge: wedge.trim() })
    setDirty(false)
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = { answer: 0, attention: 0, model: 0 }
    for (const r of rows) if (r.kind) m[r.kind] = (m[r.kind] ?? 0) + 1
    return m
  }, [rows])

  return (
    <div className="lscape">
      <p className="lscape-intro">
        Who you compete with, and what you compete for. This is an input you set, not a metric we pull, so it can say
        what the data can't: who owns the answers you want, who wins your audience's attention, and the one thing you do
        that none of them do. Name it here and the AEO answers get written against the incumbent, and Signals can point
        to your real differentiator.
      </p>

      <label className="lscape-wedge">
        <span className="lscape-wedge-label">Your wedge</span>
        <span className="lscape-wedge-hint">The position you own that no competitor does. The sentence the whole landscape resolves to.</span>
        <textarea
          className="library-input"
          rows={3}
          placeholder="e.g. The only org that both funds community ownership and makes the films that grow the movement, then recycles the returns into the next one."
          value={wedge}
          onChange={(e) => {
            setWedge(e.target.value)
            setDirty(true)
          }}
        />
      </label>

      <div className="lscape-legend">
        {KINDS.map((k) => (
          <span className={`lscape-legend-item ${k.key}`} key={k.key}>
            <span className="lscape-kind-dot" />
            <b>{k.label}</b>
            <span className="lscape-legend-count">{counts[k.key] || 0}</span>
            <span className="lscape-legend-hint">{k.hint}</span>
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="lscape-empty">
          No competitors yet. Add the handful that actually matter: who owns the answers you want to own, who wins your
          audience's attention, and your closest direct analog.
        </div>
      ) : (
        <div className="lscape-list">
          {rows.map((r, i) => (
            <section className={`lscape-card ${r.kind ?? 'answer'}`} key={i}>
              <div className="lscape-card-top">
                <input
                  className="library-input lscape-name"
                  placeholder="Competitor name"
                  value={r.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
                <select
                  className="lscape-kind-select"
                  value={r.kind ?? 'answer'}
                  onChange={(e) => update(i, { kind: e.target.value as Competitor['kind'] })}
                >
                  {KINDS.map((k) => (
                    <option value={k.key} key={k.key}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button className="lscape-del" title="Remove" aria-label="Remove competitor" onClick={() => remove(i)}>
                  ✕
                </button>
              </div>
              <input
                className="library-input lscape-what"
                placeholder="What they are, in one line"
                value={r.what ?? ''}
                onChange={(e) => update(i, { what: e.target.value })}
              />
              <div className="lscape-two">
                <label className="lscape-field">
                  <span className="lscape-field-label">Where they win</span>
                  <textarea
                    className="library-input"
                    rows={2}
                    placeholder="The ground they hold"
                    value={r.strength ?? ''}
                    onChange={(e) => update(i, { strength: e.target.value })}
                  />
                </label>
                <label className="lscape-field">
                  <span className="lscape-field-label">Your opening</span>
                  <textarea
                    className="library-input"
                    rows={2}
                    placeholder="Where they're weak, and what it leaves you"
                    value={r.gap ?? ''}
                    onChange={(e) => update(i, { gap: e.target.value })}
                  />
                </label>
              </div>
              <input
                className="library-input lscape-url"
                placeholder="URL (optional)"
                value={r.url ?? ''}
                onChange={(e) => update(i, { url: e.target.value })}
              />
            </section>
          ))}
        </div>
      )}

      <button className="btn sm lscape-add" onClick={add}>
        + Add competitor
      </button>

      <div className={`brand-savebar${dirty ? ' dirty' : ''}`}>
        <span className="brand-savebar-status">{dirty ? '● Unsaved changes' : '✓ All changes saved'}</span>
        <button className="btn primary sm" onClick={save} disabled={!dirty}>
          {dirty ? 'Save landscape' : 'Saved'}
        </button>
      </div>

      <div className="mtx-foot">
        Layer one of two. This is the input you set. Layer two, who currently owns the answer for each question you
        rank for, and where you sit versus them over time, needs a search-results source connected (Semrush, Ahrefs, or
        an answer-engine feed). Once that's in, these named competitors get a live rank-versus read on the AEO page.
      </div>
    </div>
  )
}
