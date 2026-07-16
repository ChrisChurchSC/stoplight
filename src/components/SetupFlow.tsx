import { useEffect, useState } from 'react'
import { mapSiteStream, type MapProgress, type SiteMap, type SiteMapMessage } from '../adapters/setup/siteMap'
import type { ChannelId } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

type Step = 'input' | 'mapping' | 'review'
// The visible stepper labels, in order. stepIndex (below) maps each Step onto one of these.
const SETUP_STEPS = ['Channels', 'Map', 'Review'] as const

// Dev-only sample map so we can preview the Review step without running a real (Claude-powered,
// browser-based) site map. Enabled with localStorage 'hf.previewReview' = '1' in dev.
const PREVIEW_MAP: SiteMap = {
  brand: {
    name: 'Acme',
    website: 'https://acme.com',
    industry: 'B2B SaaS',
    voice: 'Direct and confident, a little playful. Short sentences that lead with the outcome, then back it with a number.',
  },
  audiences: [
    { name: 'Ops leaders at mid-market SaaS', description: 'VP/Director of Operations at 50–500 person software companies' },
    { name: 'Finance & FP&A teams', description: 'Controllers and analysts closing the books each month' },
    { name: 'RevOps', description: 'Revenue operations owning the pipeline data' },
  ],
  proofPoints: [
    { label: '2,000+ teams', detail: 'Used by over 2,000 operations teams worldwide' },
    { label: 'SOC 2 Type II', detail: 'Independently audited security and data controls' },
    { label: '40% faster close', detail: 'Customers close the books 40% faster on average' },
  ],
  messages: [
    { label: 'Homepage hero', headline: 'Close the books in days, not weeks', body: 'Automate the busywork of month-end so your team ships the close on time, every time.', type: 'page', audience: 'Finance & FP&A teams', channel: 'website' },
    { label: 'Product page', headline: 'One workspace for the whole close', body: 'Reconciliations, approvals, and reporting in one place — no spreadsheets to chase.', type: 'page', audience: 'Ops leaders at mid-market SaaS', channel: 'website' },
    { label: 'Pricing page', headline: 'Simple, usage-based pricing', body: 'Start free. Pay for what you close. No seats, no surprises.', type: 'page', audience: 'RevOps', channel: 'website' },
    { label: 'LinkedIn ad', headline: 'Your month-end, automated', body: 'See why 2,000+ ops teams switched to Acme.', type: 'ad', audience: 'Ops leaders at mid-market SaaS', channel: 'linkedin' },
    { label: 'LinkedIn post', headline: 'How the fastest teams close in 3 days', body: 'A quick teardown of the workflow that gets them there.', type: 'post', audience: 'Ops leaders at mid-market SaaS', channel: 'linkedin' },
    { label: 'Instagram reel', headline: 'Close day, but make it calm', body: 'Behind the scenes of a stress-free month-end.', type: 'post', audience: 'Finance & FP&A teams', channel: 'instagram' },
    { label: 'Instagram post', headline: 'The 40% faster close, explained', body: 'Three habits our fastest customers share.', type: 'post', audience: 'Finance & FP&A teams', channel: 'instagram' },
    { label: 'The Close (newsletter)', headline: 'What changed in your month-end, weekly', body: 'The two-minute read on what shifted in your numbers this week.', type: 'email', audience: 'Finance & FP&A teams', channel: 'email' },
    { label: 'Welcome email', headline: 'Welcome to Acme — start here', body: 'Connect your ledger and run your first close in minutes.', type: 'email', audience: 'RevOps', channel: 'email' },
  ],
  socials: {
    linkedin: 'https://linkedin.com/company/acme',
    instagram: 'https://instagram.com/acme',
    youtube: 'https://youtube.com/@acme',
  },
}

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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * The setup flow's guts: the 3-step "map a client from their site" experience
 * (input -> mapping -> review). Rendered inside two shells — the modal
 * `SetupWizard` (add a client later) and the full-page `Onboarding` (first run).
 * `onDone` leaves the flow (close the modal / exit onboarding); it's called after
 * a successful build or an "add by name".
 */
export function SetupFlow({ variant, onDone, onSkip }: { variant: 'modal' | 'page'; onDone: () => void; onSkip?: () => void }) {
  const setPage = useTrafficStore((s) => s.setPage)
  const provisionCurrentState = useTrafficStore((s) => s.provisionCurrentState)
  const addClient = useTrafficStore((s) => s.addClient)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)

  // Dev preview: jump straight to Review with the sample map (see PREVIEW_MAP).
  const previewReview = import.meta.env.DEV && localStorage.getItem('hf.previewReview') === '1'
  // Dev "fake onboarding": run the whole flow with sample data and NO real AI calls, so the
  // onboarding pages can be designed without connecting Claude. Toggle: localStorage
  // 'hf.fakeOnboarding' = '1' (on) / remove or '0' (off).
  const fakeOnboarding = import.meta.env.DEV && localStorage.getItem('hf.fakeOnboarding') === '1'
  const [step, setStep] = useState<Step>(previewReview ? 'review' : 'input')
  // The website (the map's anchor). Set by adding a plain domain in the channel list.
  const [url, setUrl] = useState('')
  const [stages, setStages] = useState<MapProgress[]>([])
  const [map, setMap] = useState<SiteMap | null>(previewReview ? PREVIEW_MAP : null)
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
  const [aiConnected, setAiConnected] = useState<boolean | null>(previewReview || fakeOnboarding ? true : null)
  const [manualName, setManualName] = useState('')

  useEffect(() => {
    if (previewReview || fakeOnboarding) return
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
    // Fake mode: play canned progress, then hand back the sample map — no AI, no network.
    if (fakeOnboarding) {
      const site = (url || 'your site').replace(/^https?:\/\/(www\.)?/, '')
      const fakeStages = [
        `Reading ${site}…`,
        'Scanning pages and running ads…',
        extraAccounts.length ? `Reading ${extraAccounts.length} channel${extraAccounts.length === 1 ? '' : 's'}…` : 'Looking for social profiles…',
        'Extracting voice, claims, and proof…',
        'Mapping audiences and messaging…',
      ]
      for (const detail of fakeStages) {
        setStages((s) => [...s, { stage: 'fake', detail }])
        await sleep(650)
      }
      setMap({ ...PREVIEW_MAP, brand: { ...PREVIEW_MAP.brand, website: normalizeUrl(url || 'https://acme.com') } })
      setStep('review')
      return
    }
    try {
      const m = await mapSiteStream(
        { url: normalizeUrl(url), accounts: extraAccounts },
        (e) => setStages((s) => [...s, e]),
      )
      setMap(m)
      setStep('review')
    } catch (err) {
      setError(String((err as Error)?.message ?? err))
    }
  }

  const provision = async () => {
    // Fake mode: don't write a real client/records — just leave the flow.
    if (fakeOnboarding) {
      onDone()
      return
    }
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
  // Add whatever channel the user typed to the list. A plain domain becomes the WEBSITE (the map's
  // anchor); a known social/profile URL becomes an extra channel Claude reads alongside it.
  const addChannel = () => {
    const raw = accountInput.trim()
    if (!raw || !looksLikeDomain(raw)) return
    if (platformLabel(raw) === 'account' && !url) setUrl(raw)
    else setExtraAccounts((a) => (a.includes(raw) ? a : [...a, raw]))
    setAccountInput('')
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
  // The ingested content, grouped by the channel it came from — shown on Review as "in your Library".
  const contentByChannel = channels.map((ch) => ({
    channel: ch,
    items: (map?.messages ?? []).filter((m) => m.channel === ch) as SiteMapMessage[],
  }))
  // Every account to connect: discovered on the site + ones you add by hand.
  const discoveredAccounts = map
    ? Object.entries(map.socials ?? {}).filter(([p]) => p !== 'facebook').map(([, u]) => u)
    : []
  const allAccounts = [...new Set([...discoveredAccounts, ...extraAccounts])]

  const stepIndex = step === 'input' ? 0 : step === 'mapping' ? 1 : 2
  // Skip sits with the primary CTA (not the header), so it reads as the quiet alternative to it.
  const skipBtn = onSkip ? (
    <button type="button" className="btn ghost sm setup-skip" onClick={onSkip}>
      Skip for now
    </button>
  ) : null

  // First-run onboarding (page) is about the user's OWN brand; the modal is an
  // agency mapping a client. Same flow, different voice.
  const own = variant === 'page'
  const copy = {
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
          <div className="setup-q-foot setup-q-foot-center">
            {skipBtn}
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
      <ol className={`setup-stepper${variant === 'page' ? ' setup-stepper-page' : ''}`} aria-label={`Step ${stepIndex + 1} of ${SETUP_STEPS.length}`}>
        {SETUP_STEPS.map((label, i) => {
          const state = stepIndex > i ? 'done' : stepIndex === i ? 'active' : 'todo'
          return (
            <li key={label} className={`setup-stepper-step is-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
              {i > 0 && <span className={`setup-stepper-line${stepIndex >= i ? ' is-filled' : ''}`} aria-hidden="true" />}
              <span className="setup-stepper-dot" aria-hidden="true" />
              <span className="setup-stepper-label">{label}</span>
            </li>
          )
        })}
      </ol>

      {step === 'input' && (
        <div className="setup-step setup-q">
          <h2 className="setup-q-title">{own ? 'Add your channels' : 'Add their channels'}</h2>
          <p className="setup-q-sub">
            Claude reads each one — {own ? 'your' : 'their'} site, socials, and ads — pulls the content into {own ? 'your' : 'their'} Library and maps the messaging.
          </p>

          <div className="setup-onb-add">
            <input
              className="wiz-input setup-onb-input"
              placeholder="acme.com, instagram.com/you…"
              value={accountInput}
              autoFocus
              onChange={(e) => setAccountInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addChannel()}
            />
            <button className="setup-onb-addbtn" onClick={addChannel} disabled={!looksLikeDomain(accountInput)}>
              Add
            </button>
          </div>
          <div className="setup-hint-row">
            {accountInput.trim() && !looksLikeDomain(accountInput)
              ? 'That doesn’t look like a link yet — try “acme.com” or “instagram.com/you”.'
              : url
                ? 'Your website anchors the map. Add socials and ad accounts to read those too.'
                : 'Start with your website, then add any socials.'}
          </div>

          {(url || extraAccounts.length > 0) && (
            <div className="setup-onb-chanlist">
              {url && (
                <div className="setup-onb-chan is-site">
                  <span className="setup-onb-chan-plat">website</span>
                  <span className="setup-onb-chan-url">{url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                  <button className="setup-onb-chan-x" aria-label="Remove website" onClick={() => setUrl('')}>
                    ✕
                  </button>
                </div>
              )}
              {extraAccounts.map((acct) => (
                <div key={acct} className="setup-onb-chan">
                  <span className="setup-onb-chan-plat">{platformLabel(acct)}</span>
                  <span className="setup-onb-chan-url">{acct.replace(/^https?:\/\/(www\.)?/, '')}</span>
                  <button
                    className="setup-onb-chan-x"
                    aria-label={`Remove ${acct}`}
                    onClick={() => setExtraAccounts((a) => a.filter((x) => x !== acct))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="setup-q-foot setup-q-foot-center">
            {skipBtn}
            <button className="btn primary setup-cta" disabled={!canMap} onClick={run}>
              {copy.mapBtn}
            </button>
          </div>
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
                <span className="setup-stat-l">Content pieces</span>
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

          {map.messages.length > 0 && (
            <>
              <div className="wiz-label setup-section-plain">
                Content we pulled in ({map.messages.length}) · added to your Library
              </div>
              <div className="setup-ingest">
                {contentByChannel.map(({ channel, items }) => (
                  <div key={channel} className="setup-ingest-group">
                    <div className="setup-ingest-head">
                      <ChannelIcon channel={channel} size={13} />
                      <span className="setup-ingest-chan">{channel}</span>
                      <span className="setup-ingest-count">{items.length}</span>
                    </div>
                    <div className="setup-ingest-items">
                      {items.map((m, i) => (
                        <div key={i} className="setup-ingest-item">
                          <div className="setup-ingest-item-head">{m.headline}</div>
                          {m.body && <div className="setup-ingest-item-body">{m.body}</div>}
                          <span className="setup-ingest-item-kind">{m.label || m.type}</span>
                        </div>
                      ))}
                    </div>
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
            <button className="btn sm" onClick={() => setStep('input')}>
              ← Start over
            </button>
            <span className="spacer" />
            {skipBtn}
            <button className="btn primary" disabled={provisioning} onClick={provision}>
              {provisioning ? 'Building…' : 'Build the map ↓'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
