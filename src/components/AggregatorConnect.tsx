import { useEffect, useState } from 'react'
import {
  PULL_WINDOWS,
  aggregatorSpec,
  pullsForServices,
  specKind,
  type AggregatorProvider,
  type AggregatorPull,
  type AggregatorPullResult,
  type AggregatorSource,
  type AggregatorStatus,
  type PullWindow,
} from '../domain/aggregator'
import { SourceMark } from './SourceMark'
import { sourceLabel } from '../domain/analyticsSources'

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
  /**
   * What the card is linked to now, if anything.
   *
   * A Data source card holds ONE source, so a pull does not add to the card, it takes the card over.
   * That is the right rule and the wrong silence: without this the swap happened with no warning, and
   * the table you had been reading from was replaced by one with different columns while the card
   * looked the same. Naming it is the difference between choosing a replacement and discovering one.
   */
  linkedName?: string
  /**
   * The brand this canvas writes as, and its site.
   *
   * Warehouse pulls do not need it (a project holds whatever it holds), but a direct channel does:
   * one Google account can see many properties, and the brand plus its domain is what picks the
   * right one, exactly as the brand metrics panel already resolves them.
   */
  brand: string
  website?: string
  /**
   * Which provider was picked in the card's own list, so this panel opens on its sources rather than
   * re-asking. The provider step only exists now for the case where one was not chosen up front.
   */
  initialProvider?: AggregatorProvider
  /**
   * The channel that was picked, so only its questions are shown. Without it a Search Console pick
   * would open a list that also offers GA4 and YouTube, which is a second choice for something the
   * user just chose.
   */
  initialService?: string
  /** Lands the pulled grid as a brand data set and returns its id. */
  onLand: (
    name: string,
    columns: string[],
    rows: string[][],
    provider: AggregatorProvider,
    service: string,
    query: string,
    truncated: boolean,
  ) => string
  onDone: (datasetId: string, note: string) => void
  onCancel: () => void
}

/**
 * Server codes we have a sentence for. Anything else falls through to the generic line, so an
 * internal message never reaches a marketer, and the ones we DO know name the fix.
 */
const ERROR_SENTENCE: Record<string, string> = {
  NO_KEY: 'That one is not connected on the server. Ask whoever set up this workspace to connect it.',
  NOT_CONNECTED: 'That account cannot see this channel for this brand. Check it is connected to the right property.',
  NO_PROJECT: 'That project is gone, or this account can no longer see it.',
  UNKNOWN_PULL: 'That question is not available any more. Pick another one.',
  UNKNOWN_PROVIDER: 'That source is not built yet.',
  BAD_REQUEST: 'Something was missing from that request. Try picking the channel again.',
}
const sentenceFor = (code: string): string => ERROR_SENTENCE[code] ?? 'Could not pull that. Try again, or pick a different window.'

type Step = 'provider' | 'source' | 'pull'

export function AggregatorConnect({ linkedName, brand, website, initialProvider, initialService, onLand, onDone, onCancel }: Props) {
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
      body: JSON.stringify({ brand, website, ...(body as object) }),
    })
    if (!res.ok) {
      // apiRoute already writes {error: code} into every failure body and this threw it away, so a
      // pull that failed for a nameable reason reported the same shrug as one that failed for any
      // other. Read it, and map only codes we have a sentence for: an internal string like
      // "summer query 403" must never reach a marketer.
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(res.status === 501 ? 'NO_KEY' : body.error || `aggregator ${res.status}`)
    }
    return res.json()
  }

  useEffect(() => {
    let live = true
    void (async () => {
      // Picked in the card's list already: go straight to its sources. Asking again, with a list of
      // one, would be a step that offers no choice.
      if (initialProvider) {
        if (live) await chooseProvider(initialProvider)
        return
      }
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
      setError(sentenceFor((e as Error).message))
      setProvider(null)
    } finally {
      setBusy(false)
    }
  }

  const runPull = async (pull: AggregatorPull) => {
    if (!provider || !source) return
    setBusy(true)
    setError('')
    try {
      const r = (await post({ op: 'pull', provider, source: source.id, pull: pull.id, days })) as AggregatorPullResult
      if (!r.columns.length) {
        setError('That came back with no columns.')
        return
      }
      if (!r.rows.length) {
        // An empty grid would land looking like a measured zero. Say it instead.
        setError(`No rows in the last ${days} days. Try a longer window.`)
        return
      }
      const name = `${pull.shortName} · ${source.label.split(' · ')[0]} · ${days}d`
      // r.truncated was already in hand here and thrown away. A table that stopped at the cap must
      // say so, or a sum over it later reads as a total.
      const id = onLand(name, r.columns, r.rows, provider, pull.service, `${pull.id}:${days}d`, r.truncated)
      const cap = r.truncated ? `, capped at ${r.rows.length}` : ''
      onDone(id, `${r.rows.length} row${r.rows.length === 1 ? '' : 's'} from ${aggregatorSpec(provider)?.label}, last ${days} days${cap}.`)
    } catch (e) {
      setError(sentenceFor((e as Error).message))
    } finally {
      setBusy(false)
    }
  }

  // Narrowed to the channel that was picked, when one was.
  const pulls = source
    ? pullsForServices(initialService ? source.services.filter((x) => x === initialService) : source.services)
    : []

  return (
    <div className="flow-agg" onMouseDown={(e) => e.stopPropagation()}>
      {/* Shown on every step, not just the last one: by the time you are choosing a question you have
          stopped thinking about what the card was already holding. */}
      {linkedName && (
        <span className="flow-agg-replace">
          This card holds one source. Pulling replaces “{linkedName}”, which stays in your data sets.
        </span>
      )}
      {step === 'provider' && (
        <>
          {!status && !error && <span className="flow-agg-muted">Checking…</span>}
          {(['warehouse', 'channel'] as const).map((group) => {
            // READY ONLY. A row you cannot click is clutter: it explains a setup step to someone who
            // is trying to pick a data source, and it made the list twice as long as the part of it
            // that works. What is missing is a deployment concern, not a thing to choose between.
            const inGroup = (status?.providers ?? []).filter((p) => {
              const spec = aggregatorSpec(p.id)
              return spec && specKind(spec) === group && p.implemented && p.configured
            })
            if (!inGroup.length) return null
            return (
              <div key={group} className="flow-agg-group">
                <span className="flow-agg-head">{group === 'warehouse' ? 'From a warehouse' : 'Straight from the channel'}</span>
                {inGroup.map((p) => {
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
                <span className="flow-agg-mark"><SourceMark id={p.id} /></span>
                <span className="flow-agg-name">
                  {spec.label}
                  {/* The dot follows the NAME rather than leading the row, now that the logo holds
                      the left column: connected is a fact about the provider, not a bullet. */}
                  <span className={`flow-agg-dot${ready ? ' on' : ''}`} />
                </span>
                {/* The two reasons a provider is unavailable are different problems with different
                    fixes, so they get different sentences rather than one greyed-out row. */}
                <span className="flow-agg-why">
                  {!p.implemented ? spec.blurb : p.configured ? spec.blurb : `Set ${spec.envVar} to connect`}
                </span>
              </button>
                  )
                })}
              </div>
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
          <span className="flow-agg-head">{initialService ? sourceLabel(initialService) : source.label}</span>
          <div className="flow-agg-win">
            {PULL_WINDOWS.map((w) => (
              <button key={w} className={`flow-agg-chip${days === w ? ' on' : ''}`} disabled={busy} onClick={() => setDays(w)}>
                {w === 365 ? '1 year' : `${w} days`}
              </button>
            ))}
          </div>
          {pulls.map((p) => (
            <button key={p.id} className="flow-agg-row" disabled={busy} onClick={() => void runPull(p)}>
              {/* The platform's mark, not the aggregator's: six questions from four services read as
                  one undifferentiated list otherwise. */}
              <span className="flow-agg-mark"><SourceMark id={p.service} /></span>
              {/* The question leads, what it decides sits under it, and the column list survives on
                  hover: it is worth having, and it is the worst possible headline. */}
              <span className="flow-agg-name">{p.question}</span>
              <span className="flow-agg-why" title={p.detail}>{p.decides}</span>
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
        {step !== 'provider' && !initialProvider && (
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
