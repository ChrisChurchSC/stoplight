import { useEffect, useState } from 'react'
import { mapSiteStream, type MapProgress, type SiteMap } from '../adapters/setup/siteMap'
import type { ChannelId } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

type Step = 'input' | 'mapping' | 'review'

/** A short platform label from an account URL, for the connect list. */
function platformLabel(u: string): string {
  const s = u.toLowerCase()
  if (s.includes('instagram')) return 'instagram'
  if (s.includes('linkedin')) return 'linkedin'
  if (s.includes('youtube')) return 'youtube'
  if (s.includes('tiktok')) return 'tiktok'
  if (s.includes('x.com') || s.includes('twitter')) return 'x'
  if (s.includes('facebook')) return 'facebook'
  return 'account'
}

/** Add a scheme if the person typed a bare domain, so the mapper always gets a URL. */
function normalizeUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return s
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

/** Loose check that the input reads like a domain (so we enable "Map"). */
function looksLikeDomain(raw: string): boolean {
  const s = raw.trim().replace(/^https?:\/\//i, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(s)
}

/**
 * The setup flow's guts: the 3-step "map a client from their site" experience
 * (input -> mapping -> review). Rendered inside two shells — the modal
 * `SetupWizard` (add a client later) and the full-page `Onboarding` (first run).
 * `onDone` leaves the flow (close the modal / exit onboarding); it's called after
 * a successful build or an "add by name".
 */
export function SetupFlow({ variant, onDone }: { variant: 'modal' | 'page'; onDone: () => void }) {
  const setPage = useTrafficStore((s) => s.setPage)
  const provisionCurrentState = useTrafficStore((s) => s.provisionCurrentState)
  const addClient = useTrafficStore((s) => s.addClient)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)

  const [step, setStep] = useState<Step>('input')
  // The input step asks one thing at a time: the site, then an optional note.
  const [inputPhase, setInputPhase] = useState<'site' | 'context'>('site')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [stages, setStages] = useState<MapProgress[]>([])
  const [map, setMap] = useState<SiteMap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [provisioning, setProvisioning] = useState(false)
  // Channel connect: account URL -> pending token (browser open), and the set
  // connected. extraAccounts = accounts you add by hand at onboarding.
  const [connecting, setConnecting] = useState<Record<string, string>>({})
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const [extraAccounts, setExtraAccounts] = useState<string[]>([])
  const [accountInput, setAccountInput] = useState('')
  // Whether an AI provider is configured. null = still checking. Auto-map needs
  // Claude; with no key we lead with a manual "name your brand" setup instead.
  const [aiConnected, setAiConnected] = useState<boolean | null>(null)
  const [manualName, setManualName] = useState('')

  useEffect(() => {
    let cancelled = false
    // Dev-only override to preview the no-AI path where a key is present locally.
    if (import.meta.env.DEV && localStorage.getItem('hf.forceNoAI') === '1') {
      setAiConnected(false)
      return
    }
    void fetch('/api/ai-status')
      .then((r) => (r.ok ? r.json() : { connected: false }))
      .then((d: { connected?: boolean }) => !cancelled && setAiConnected(!!d.connected))
      .catch(() => !cancelled && setAiConnected(false))
    return () => {
      cancelled = true
    }
  }, [])

  const canMap = looksLikeDomain(url)

  const run = async () => {
    setStep('mapping')
    setStages([])
    setError(null)
    try {
      const m = await mapSiteStream(
        { url: normalizeUrl(url), notes: notes.trim() || undefined, accounts: extraAccounts },
        (e) => setStages((s) => [...s, e]),
      )
      setMap(m)
      setStep('review')
    } catch (err) {
      setError(String((err as Error)?.message ?? err))
    }
  }

  const provision = async () => {
    if (!map) return
    setProvisioning(true)
    await provisionCurrentState(map)
    onDone()
  }

  // Send them to Connectors and leave the flow (they can restart setup after).
  const goToConnectors = () => {
    setPage('connectors')
    onDone()
  }

  // Connect a channel: open a real browser to log in, then save the session so
  // Claude can read it. A re-map then pulls that channel into the map. Keyed by
  // the account URL, so it works for discovered and manually-added accounts alike.
  const startConnect = async (channelUrl: string) => {
    const res = await fetch('/api/connect/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: channelUrl }),
    })
    const { token } = (await res.json()) as { token?: string }
    if (token) setConnecting((c) => ({ ...c, [channelUrl]: token }))
  }
  const finishConnect = async (channelUrl: string) => {
    const token = connecting[channelUrl]
    if (!token) return
    await fetch('/api/connect/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    setConnecting((c) => {
      const next = { ...c }
      delete next[channelUrl]
      return next
    })
    setConnected((s) => new Set(s).add(channelUrl))
  }
  const addAccount = () => {
    const u = accountInput.trim()
    if (!u) return
    setExtraAccounts((a) => (a.includes(u) ? a : [...a, u]))
    setAccountInput('')
  }

  // Escape hatch: no public site (or you want to start manual). Create the client
  // by name and drop into an empty workspace to fill in. Onboarding stays one flow.
  const addByName = () => {
    const name = url.trim()
    if (!name) return
    addClient(name)
    setClientFilter(name)
    onDone()
  }

  // No-AI path: create the brand by name and drop into the workspace to fill in.
  const createManually = () => {
    const name = manualName.trim()
    if (!name) return
    addClient(name)
    setClientFilter(name)
    onDone()
  }

  const channels = map ? [...new Set(map.messages.map((m) => m.channel as ChannelId))] : []
  // Every account to connect: discovered on the site + ones you add by hand.
  const discoveredAccounts = map
    ? Object.entries(map.socials ?? {}).filter(([p]) => p !== 'facebook').map(([, u]) => u)
    : []
  const allAccounts = [...new Set([...discoveredAccounts, ...extraAccounts])]

  const stepIndex = step === 'input' ? 0 : step === 'mapping' ? 1 : 2
  const cls = (i: number) => `wiz-step${stepIndex === i ? ' active' : stepIndex > i ? ' done' : ''}`

  // First-run onboarding (page) is about the user's OWN brand; the modal is an
  // agency mapping a client. Same flow, different voice.
  const own = variant === 'page'
  const copy = {
    siteTitle: own ? 'What’s your website?' : 'What’s your client’s website?',
    siteSub: own
      ? 'Claude reads your live site and running ads, then maps your whole messaging: voice, audiences, claims, and proof.'
      : 'Claude reads their live site and running ads, then maps their whole messaging: voice, audiences, claims, and proof.',
    byName: own
      ? `No website? Add “${url.trim() || 'your brand'}” by name instead`
      : `No public site? Add “${url.trim() || 'them'}” by name instead`,
    mapBtn: own ? '✦ Map my brand →' : '✦ Map their messaging →',
    channelsLives: own ? 'Channels your messaging lives on' : 'Channels their messaging lives on',
    channelsTitle: own ? 'Your channels' : 'Their channels',
    manualTitle: own ? 'What’s your brand called?' : 'What’s your client called?',
    manualSub: own
      ? 'We’ll set up your brand so you can start building. Add your site, voice, and audiences anytime.'
      : 'We’ll set up the client so you can start building. Add their site and details anytime.',
    manualPlaceholder: own ? 'Your brand name' : 'Client name',
    manualCta: own ? 'Create my brand →' : 'Create client →',
  }

  // Still checking whether AI is available.
  if (aiConnected === null) {
    return (
      <div className={`setup-flow setup-flow-${variant}`}>
        <div className="setup-step setup-generating">
          <div className="setup-spinner">✦</div>
        </div>
      </div>
    )
  }

  // No AI provider: lead with a manual, one-question brand setup (no auto-map).
  if (!aiConnected) {
    return (
      <div className={`setup-flow setup-flow-${variant}`}>
        <div className="setup-step setup-q">
          <h2 className="setup-q-title">{copy.manualTitle}</h2>
          <p className="setup-q-sub">{copy.manualSub}</p>
          <div className="setup-q-field">
            <input
              className="wiz-input"
              value={manualName}
              placeholder={copy.manualPlaceholder}
              autoFocus
              onChange={(e) => setManualName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && manualName.trim() && createManually()}
            />
          </div>
          <div className="setup-q-foot">
            <button className="btn primary setup-cta" disabled={!manualName.trim()} onClick={createManually}>
              {copy.manualCta}
            </button>
          </div>
          <div className="setup-q-note">
            Connect Claude later to auto-map a brand from its website.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`setup-flow setup-flow-${variant}`}>
      <div className={`wiz-steps setup-steps${variant === 'page' ? ' setup-steps-page' : ''}`}>
        <span className={cls(0)}>1 · Site</span>
        <span className="wiz-step-sep">›</span>
        <span className={cls(1)}>2 · Map</span>
        <span className="wiz-step-sep">›</span>
        <span className={cls(2)}>3 · Review</span>
      </div>

      {step === 'input' && inputPhase === 'site' && (
        <div className="setup-step setup-q">
          <h2 className="setup-q-title">{copy.siteTitle}</h2>
          <p className="setup-q-sub">{copy.siteSub}</p>
          <div className="setup-input-wrap setup-q-input">
            <span className="setup-input-globe" aria-hidden="true">
              ⦿
            </span>
            <input
              className="wiz-input"
              value={url}
              placeholder="acme.com"
              autoFocus
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canMap && setInputPhase('context')}
            />
          </div>
          <div className="setup-hint-row">
            {url.trim() && !canMap
              ? 'That doesn’t look like a domain yet — try “acme.com”.'
              : 'Just the domain is enough — we add https:// for you.'}
          </div>

          <div className="setup-q-foot">
            <button className="btn primary setup-cta" disabled={!canMap} onClick={() => setInputPhase('context')}>
              Continue →
            </button>
          </div>

          <button className="wiz-link setup-q-alt" disabled={!url.trim()} onClick={addByName}>
            {copy.byName}
          </button>
        </div>
      )}

      {step === 'input' && inputPhase === 'context' && (
        <div className="setup-step setup-q">
          <h2 className="setup-q-title">Anything Claude should know?</h2>
          <p className="setup-q-sub">Optional. A nudge on what to focus on or ignore, or just map it.</p>
          <textarea
            className="wiz-input wiz-textarea setup-q-textarea"
            value={notes}
            placeholder="e.g. focus on their B2B line, ignore the legacy blog"
            autoFocus
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="setup-q-foot">
            <button className="btn" onClick={() => setInputPhase('site')}>
              ← Back
            </button>
            <span className="spacer" />
            <button className="btn primary setup-cta" onClick={run}>
              {copy.mapBtn}
            </button>
          </div>
          <div className="setup-q-note">Nothing is committed until you review the map.</div>
        </div>
      )}

      {step === 'mapping' && (
        <div className="setup-step setup-generating">
          <div className="setup-spinner">✦</div>
          <div className="setup-gen-title">Reading {url || 'their site'}…</div>
          <ul className="setup-stages">
            {stages.map((s, i) => {
              const last = i === stages.length - 1 && !error
              return (
                <li key={i} className={`setup-stage${last ? ' active' : ''}`}>
                  <span className="setup-stage-tick">{last ? '✦' : '✓'}</span>
                  {s.detail}
                </li>
              )
            })}
          </ul>
          {error && (
            <div className="setup-error-card">
              <div className="setup-error-title">Couldn’t map the site</div>
              <div className="setup-error-msg">{error}</div>
              <div className="setup-error-actions">
                <button className="btn sm primary" onClick={() => setStep('input')}>
                  Try again
                </button>
                <button className="btn sm" onClick={goToConnectors}>
                  Set up Claude →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'review' && map && (
        <div className="setup-step">
          <div className="setup-summary">
            <div className="setup-summary-head">
              <span className="setup-summary-badge">✓</span>
              <div>
                <div className="setup-summary-title">
                  Mapped {(map.brand.website || url).replace(/^https?:\/\/(www\.)?/, '')}
                </div>
                <div className="setup-summary-sub">Review the map, then build it. Nothing is saved yet.</div>
              </div>
            </div>
            <div className="setup-stat-row">
              <div className="setup-stat">
                <span className="setup-stat-n">{map.audiences.length}</span>
                <span className="setup-stat-l">Audiences</span>
              </div>
              <div className="setup-stat">
                <span className="setup-stat-n">{channels.length}</span>
                <span className="setup-stat-l">Channels</span>
              </div>
              <div className="setup-stat">
                <span className="setup-stat-n">{map.messages.length}</span>
                <span className="setup-stat-l">Live messages</span>
              </div>
              <div className="setup-stat">
                <span className="setup-stat-n">{map.proofPoints.length}</span>
                <span className="setup-stat-l">Proof points</span>
              </div>
            </div>
          </div>

          <div className="wiz-label setup-section-plain">Brand voice</div>
          <div className="setup-voice">{map.brand.voice}</div>

          <div className="wiz-label setup-section-plain">Audiences ({map.audiences.length})</div>
          <div className="setup-chips">
            {map.audiences.map((a) => (
              <span key={a.name} className="setup-chip" title={a.description}>
                {a.name}
              </span>
            ))}
          </div>

          <div className="wiz-label setup-section-plain">{copy.channelsLives}</div>
          <div className="setup-channel-list">
            {channels.map((c) => (
              <span key={c} className="setup-channel on">
                <ChannelIcon channel={c} size={13} />
                {c}
              </span>
            ))}
          </div>

          {map.proofPoints.length > 0 && (
            <>
              <div className="wiz-label setup-section-plain">Proof points ({map.proofPoints.length})</div>
              <div className="setup-rtbs">
                {map.proofPoints.slice(0, 6).map((r, i) => (
                  <div key={i} className="setup-rtb">
                    <span className="setup-rtb-label">{r.label}</span>
                    <span className="setup-rtb-detail">{r.detail}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="setup-connect-block">
            <div className="setup-connect-head">
              <span className="setup-connect-title">{copy.channelsTitle}</span>
              <span className="setup-connect-opt">Optional · go deeper</span>
            </div>
            <div className="wiz-hint setup-socials-note">
              Connect logs you into a channel once (your password goes to the platform, never to us),
              then Claude reads it like the website. Add any account, connect each, then re-map.
            </div>
            <div className="setup-socials">
              {allAccounts.map((acct) => (
                <div key={acct} className="setup-social-row">
                  <span className="setup-chip">{platformLabel(acct)}</span>
                  <span className="setup-acct-url">{acct.replace(/^https?:\/\/(www\.)?/, '')}</span>
                  {connected.has(acct) ? (
                    <span className="setup-connected">✓ connected</span>
                  ) : connecting[acct] ? (
                    <button className="btn sm primary" onClick={() => finishConnect(acct)}>
                      I've logged in, save
                    </button>
                  ) : (
                    <button className="btn sm" onClick={() => startConnect(acct)}>
                      Connect
                    </button>
                  )}
                </div>
              ))}
              {allAccounts.length === 0 && (
                <div className="wiz-hint">No channels found on their site. Add any below.</div>
              )}
            </div>

            <div className="setup-addacct">
              <input
                className="wiz-input"
                placeholder="Add an account, e.g. instagram.com/theirhandle"
                value={accountInput}
                onChange={(e) => setAccountInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAccount()}
              />
              <button className="btn sm" onClick={addAccount} disabled={!accountInput.trim()}>
                + Add
              </button>
            </div>

            {connected.size > 0 && (
              <button className="btn sm primary setup-remap" onClick={run}>
                ✦ Re-map to pull connected channels →
              </button>
            )}
          </div>

          <div className="wiz-foot setup-foot-sticky">
            <button
              className="btn sm"
              onClick={() => {
                setStep('input')
                setInputPhase('site')
              }}
            >
              ← Start over
            </button>
            <span className="spacer" />
            <button className="btn primary" disabled={provisioning} onClick={provision}>
              {provisioning ? 'Building…' : 'Build the map ↓'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
