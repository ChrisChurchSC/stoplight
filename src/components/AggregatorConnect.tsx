import { useEffect, useState } from 'react'
import {
  PULL_WINDOWS,
  aggregatorSpec,
  pullsForServices,
  type AggregatorProvider,
  type AggregatorPullResult,
  type AggregatorSource,
  type AggregatorStatus,
  type PullWindow,
} from '../domain/aggregator'

/**
 * The aggregator panel on a Data source card: pick a provider, a source, a question, pull it.
 *
 * WHAT THIS IS GUARDING AGAINST. The thing it replaces was a list of four connector names that set a
 * string on the card and fetched nothing, so a card could sit on a canvas looking wired to Google
 * Analytics while contributing no data to anything. Every state here is therefore the real one:
 * providers report whether a key exists on the server, the question list is narrowed to the services
 * the chosen warehouse actually has, and a pull that returns nothing says so rather than landing an
 * empty spreadsheet that reads as "no traffic".
 *
 * Kept out of FlowsView because it owns five pieces of transient state that belong to one card and
 * should die with it, and FlowsView is long enough.
 */

interface Props {
  /** Lands the pulled grid as a brand data set and returns its id. */
  onLand: (name: string, columns: string[], rows: string[][], provider: AggregatorProvider, query: string) => string
  onDone: (datasetId: string, note: string) => void
  onCancel: () => void
}

type Step = 'provider' | 'source' | 'pull'

export function AggregatorConnect({ onLand, onDone, onCancel }: Props) {
  const [status, setStatus] = useState<AggregatorStatus | null>(null)
  const [step, setStep] = useState<Step>('provider')
  const [provider, setProvider] = useState<AggregatorProvider | null>(null)
  const [sources, setSources] = useState<AggregatorSource[] | null>(null)
  const [source, setSource] = useState<AggregatorSource | null>(null)
  const [days, setDays] = useState<PullWindow>(90)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const post = async (body: unknown): Promise<unknown> => {
    const res = await fetch('/api/aggregator', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(res.status === 501 ? 'NO_KEY' : `aggregator ${res.status}`)
    return res.json()
  }

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const s = (await post({ op: 'status' })) as AggregatorStatus
        if (live) setStatus(s)
      } catch {
        if (live) setError('Could not check what is connected.')
      }
    })()
    return () => {
      live = false
    }
  }, [])

  const chooseProvider = async (id: AggregatorProvider) => {
    setProvider(id)
    setBusy(true)
    setError('')
    try {
      const r = (await post({ op: 'sources', provider: id })) as { sources: AggregatorSource[] }
      setSources(r.sources)
      // One source is the common case, so skip a screen that offers no choice.
      if (r.sources.length === 1) {
        setSource(r.sources[0])
        setStep('pull')
      } else setStep('source')
    } catch (e) {
      setError((e as Error).message === 'NO_KEY' ? 'That one is not connected on the server.' : 'Could not reach it.')
      setProvider(null)
    } finally {
      setBusy(false)
    }
  }

  const runPull = async (pullId: string, label: string) => {
    if (!provider || !source) return
    setBusy(true)
    setError('')
    try {
      const r = (await post({ op: 'pull', provider, source: source.id, pull: pullId, days })) as AggregatorPullResult
      if (!r.columns.length) {
        setError('That came back with no columns.')
        return
      }
      if (!r.rows.length) {
        // An empty grid would land looking like a measured zero. Say it instead.
        setError(`No rows in the last ${days} days. Try a longer window.`)
        return
      }
      const name = `${label} · ${source.label.split(' · ')[0]}`
      const id = onLand(name, r.columns, r.rows, provider, `${pullId}:${days}d`)
      const cap = r.truncated ? `, capped at ${r.rows.length}` : ''
      onDone(id, `${r.rows.length} row${r.rows.length === 1 ? '' : 's'} from ${aggregatorSpec(provider)?.label}, last ${days} days${cap}.`)
    } catch (e) {
      setError((e as Error).message === 'NO_KEY' ? 'That one is not connected on the server.' : 'Could not pull that.')
    } finally {
      setBusy(false)
    }
  }

  const pulls = source ? pullsForServices(source.services) : []

  return (
    <div className="flow-agg" onMouseDown={(e) => e.stopPropagation()}>
      {step === 'provider' && (
        <>
          <span className="flow-agg-head">Connect an aggregator</span>
          {!status && !error && <span className="flow-agg-muted">Checking…</span>}
          {status?.providers.map((p) => {
            const spec = aggregatorSpec(p.id)
            if (!spec) return null
            const ready = p.implemented && p.configured
            return (
              <button
                key={p.id}
                className={`flow-agg-row${ready ? '' : ' off'}`}
                disabled={!ready || busy}
                onClick={() => void chooseProvider(p.id)}
              >
                <span className={`flow-agg-dot${ready ? ' on' : ''}`} />
                <span className="flow-agg-name">{spec.label}</span>
                {/* The two reasons a provider is unavailable are different problems with different
                    fixes, so they get different sentences rather than one greyed-out row. */}
                <span className="flow-agg-why">
                  {!p.implemented ? spec.blurb : p.configured ? spec.blurb : `Set ${spec.envVar} to connect`}
                </span>
              </button>
            )
          })}
          {/* Named even when every provider is dark, so the panel explains itself rather than
              looking broken to someone who has never connected one. */}
          {status && !status.providers.some((p) => p.implemented && p.configured) && (
            <span className="flow-agg-muted">
              Nothing is connected yet. Upload a CSV or describe a data set instead.
            </span>
          )}
        </>
      )}

      {step === 'source' && (
        <>
          <span className="flow-agg-head">Which one?</span>
          {sources?.map((s) => (
            <button key={s.id} className="flow-agg-row" disabled={busy} onClick={() => { setSource(s); setStep('pull') }}>
              <span className="flow-agg-name">{s.label}</span>
              <span className="flow-agg-why">{s.services.length} connected</span>
            </button>
          ))}
          {sources && !sources.length && <span className="flow-agg-muted">No queryable projects on that account.</span>}
        </>
      )}

      {step === 'pull' && source && (
        <>
          <span className="flow-agg-head">{source.label}</span>
          <div className="flow-agg-win">
            {PULL_WINDOWS.map((w) => (
              <button key={w} className={`flow-agg-chip${days === w ? ' on' : ''}`} disabled={busy} onClick={() => setDays(w)}>
                {w === 365 ? '1 year' : `${w} days`}
              </button>
            ))}
          </div>
          {pulls.map((p) => (
            <button key={p.id} className="flow-agg-row" disabled={busy} onClick={() => void runPull(p.id, p.label)}>
              <span className="flow-agg-name">{p.label}</span>
              <span className="flow-agg-why">{p.detail}</span>
            </button>
          ))}
          {/* A warehouse with no matching marts is a real state: the account is connected, this
              project just has nothing we know how to ask about. */}
          {!pulls.length && (
            <span className="flow-agg-muted">
              Nothing here we know how to query yet. Connected: {source.services.join(', ') || 'nothing'}.
            </span>
          )}
        </>
      )}

      {busy && <span className="flow-agg-muted">Working…</span>}
      {error && <span className="flow-agg-err">{error}</span>}
      <div className="flow-agg-foot">
        {step !== 'provider' && (
          <button
            className="flow-compose-x"
            disabled={busy}
            onClick={() => {
              setStep('provider')
              setProvider(null)
              setSource(null)
              setSources(null)
              setError('')
            }}
          >
            Back
          </button>
        )}
        <button className="flow-compose-x" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
