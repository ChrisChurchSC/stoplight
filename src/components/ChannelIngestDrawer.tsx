import { useEffect, useState } from 'react'
import { useTrafficStore, profileUrlForChannel } from '../store/useTrafficStore'
import { CHANNELS } from '../domain/channels'
import { ChannelIcon } from './ChannelIcon'

/**
 * Link one channel and pull ALL of its copy — including the copy baked into the
 * art. Opened from Foundation › Channels by clicking a channel. The link step
 * reuses the connect flow (log in once so Claude reads the channel
 * authenticated), with a no-login fallback for public reads. The ingest then
 * gathers the feed and runs Claude vision over the post images to transcribe the
 * on-image copy, and the result shows every word a post puts in front of someone.
 */

const OWNED = ['website', 'blog', 'landing-page', 'lead-magnet', 'email']

const EMPTY_GADS = {
  developerToken: '',
  clientId: '',
  clientSecret: '',
  refreshToken: '',
  customerId: '',
  loginCustomerId: '',
}
const GADS_FIELDS = [
  { k: 'developerToken', label: 'Developer token', pw: true, ph: '' },
  { k: 'clientId', label: 'OAuth client ID', pw: false, ph: '' },
  { k: 'clientSecret', label: 'OAuth client secret', pw: true, ph: '' },
  { k: 'refreshToken', label: 'Refresh token', pw: true, ph: 'from a one-time OAuth consent' },
  { k: 'customerId', label: 'Customer ID', pw: false, ph: '123-456-7890' },
  { k: 'loginCustomerId', label: 'Login customer ID (manager account, optional)', pw: false, ph: 'optional' },
] as const

export function ChannelIngestDrawer() {
  const open = useTrafficStore((s) => s.channelIngestOpen)
  const target = useTrafficStore((s) => s.channelIngestTarget)
  const close = useTrafficStore((s) => s.closeChannelIngest)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const linkChannelUrl = useTrafficStore((s) => s.linkChannelUrl)
  const setSanityCreds = useTrafficStore((s) => s.setSanityCreds)
  const setResendCreds = useTrafficStore((s) => s.setResendCreds)
  const setGoogleAdsCreds = useTrafficStore((s) => s.setGoogleAdsCreds)
  const ingestChannel = useTrafficStore((s) => s.ingestChannel)
  const ingesting = useTrafficStore((s) => s.ingestingChannel)
  const stages = useTrafficStore((s) => s.channelIngestStages)
  const result = useTrafficStore((s) => s.channelIngestResult)
  const error = useTrafficStore((s) => s.channelIngestError)

  const client = target?.client ?? ''
  const channel = target?.channel
  const profile = client ? clientProfiles[client] : undefined
  const owned = channel ? OWNED.includes(channel) : false
  const isSanity = target?.kind === 'sanity'
  const isResend = target?.kind === 'resend'
  const isGoogleAds = target?.kind === 'google-ads'
  const linkedUrl = channel ? profileUrlForChannel(channel, profile?.channels) : undefined

  const [urlInput, setUrlInput] = useState('')
  const [connectToken, setConnectToken] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [sanityProject, setSanityProject] = useState('')
  const [sanityDataset, setSanityDataset] = useState('production')
  const [sanityToken, setSanityToken] = useState('')
  const [resendKey, setResendKey] = useState('')
  const [gads, setGads] = useState(EMPTY_GADS)

  // Reset per target (the drawer stays mounted; only its target changes).
  useEffect(() => {
    setUrlInput(linkedUrl ?? '')
    setConnectToken(null)
    setConnected(false)
    setSanityProject(profile?.sanity?.projectId ?? '')
    setSanityDataset(profile?.sanity?.dataset ?? 'production')
    setSanityToken(profile?.sanity?.token ?? '')
    setResendKey(profile?.resend?.apiKey ?? '')
    setGads({ ...EMPTY_GADS, ...(profile?.googleAds ?? {}) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.client, target?.channel, target?.kind])

  if (!open || !target || !channel) return null
  const cfg = CHANNELS[channel]
  const label = isGoogleAds ? 'Google Ads' : isResend ? 'Resend' : isSanity ? 'Sanity CMS' : (cfg?.label ?? channel)

  // Connect a channel: open a real browser to log in, save the session so Claude
  // reads it authenticated. Falls back to a public read when no browser is up.
  const startConnect = async () => {
    const u = urlInput.trim()
    if (!u) return
    linkChannelUrl(client, channel, u)
    try {
      const res = await fetch('/api/connect/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: u }),
      })
      const { token } = (await res.json()) as { token?: string }
      if (token) setConnectToken(token)
    } catch {
      // No browser/endpoint (e.g. the deployed demo): fall through to public read.
    }
  }
  const saveConnect = async () => {
    if (!connectToken) return
    try {
      await fetch('/api/connect/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: connectToken }),
      })
    } finally {
      setConnectToken(null)
      setConnected(true)
    }
  }

  const runIngest = async () => {
    if (isGoogleAds) {
      setGoogleAdsCreds(client, {
        developerToken: gads.developerToken.trim(),
        clientId: gads.clientId.trim(),
        clientSecret: gads.clientSecret.trim(),
        refreshToken: gads.refreshToken.trim(),
        customerId: gads.customerId.trim(),
        loginCustomerId: gads.loginCustomerId.trim() || undefined,
      })
    } else if (isResend) {
      setResendCreds(client, { apiKey: resendKey.trim() })
    } else if (isSanity) {
      setSanityCreds(client, {
        projectId: sanityProject.trim(),
        dataset: sanityDataset.trim() || 'production',
        token: sanityToken.trim() || undefined,
      })
    } else if (!owned && urlInput.trim()) {
      linkChannelUrl(client, channel, urlInput.trim())
    }
    await ingestChannel()
  }

  const canIngest = isGoogleAds
    ? !!(gads.developerToken.trim() && gads.clientId.trim() && gads.clientSecret.trim() && gads.refreshToken.trim() && gads.customerId.trim())
    : isResend
      ? !!resendKey.trim()
      : isSanity
        ? !!sanityProject.trim()
        : owned || !!urlInput.trim() || !!linkedUrl

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <aside className="drawer channel-ingest" role="dialog" aria-label={`Ingest ${label}`}>
        <header className="drawer-head">
          <div className="chi-title">
            {isResend ? (
              <span className="chi-glyph">✉</span>
            ) : isSanity ? (
              <span className="chi-glyph">◆</span>
            ) : (
              <ChannelIcon channel={channel} size={16} />
            )}
            <strong>{label}</strong>
            <span className="chi-for">for {client}</span>
          </div>
          <button className="btn ghost sm" onClick={close}>
            Close
          </button>
        </header>

        <div className="drawer-body chi-body">
          {error?.code === 'NO_KEY' && (
            <div className="chi-note warn">
              Connect Claude to read channels. Set ANTHROPIC_API_KEY, then ingest again.
            </div>
          )}

          {result ? (
            <ChannelResult label={label} onClose={close} onReingest={runIngest} ingesting={ingesting} />
          ) : ingesting ? (
            <div className="chi-stages">
              <div className="setup-spinner">✦</div>
              <div className="setup-gen-title">Reading {label}…</div>
              <ul className="setup-stages">
                {stages.map((s, i) => {
                  const last = i === stages.length - 1
                  return (
                    <li key={i} className={`setup-stage${last ? ' active' : ''}`}>
                      <span className="setup-stage-tick">{last ? '✦' : '✓'}</span>
                      {s.detail}
                    </li>
                  )
                })}
                {stages.length === 0 && <li className="setup-stage active">Starting…</li>}
              </ul>
            </div>
          ) : (
            <div className="chi-setup">
              <p className="chi-lead">
                {isGoogleAds
                  ? `Pull ${client}'s live Google Ads copy via the Google Ads API. Claude reads the running headlines and descriptions and maps them into the paid Google channels.`
                  : isResend
                    ? `Pull ${client}'s email copy from Resend. Claude reads your recent broadcasts and maps them into the email channel.`
                    : isSanity
                      ? `Pull ${client}'s owned content straight from Sanity. Claude reads the copy in your dataset and maps it into the brand's current state.`
                      : 'Link this channel and pull all of its live copy. Claude reads the captions and the copy baked into the art (the words inside each image), then maps it into the brand’s current state.'}
              </p>

              {isGoogleAds ? (
                <>
                  {GADS_FIELDS.map((f) => (
                    <div key={f.k}>
                      <label className="wiz-label">{f.label}</label>
                      <input
                        className="wiz-input"
                        type={f.pw ? 'password' : 'text'}
                        value={gads[f.k]}
                        placeholder={f.ph}
                        onChange={(e) => setGads((g) => ({ ...g, [f.k]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <p className="wiz-hint chi-hint">
                    Needs an approved Google Ads developer token and a refresh token (one-time OAuth
                    consent). Read-only; stored locally with this client.
                  </p>
                </>
              ) : isResend ? (
                <>
                  <label className="wiz-label">Resend API key</label>
                  <input
                    className="wiz-input"
                    type="password"
                    value={resendKey}
                    placeholder="re_…"
                    autoFocus
                    onChange={(e) => setResendKey(e.target.value)}
                  />
                  <p className="wiz-hint chi-hint">
                    Read access to broadcasts is enough. Stored locally with this client, only ever
                    sent to Resend.
                  </p>
                </>
              ) : isSanity ? (
                <>
                  <label className="wiz-label">Sanity project ID</label>
                  <input
                    className="wiz-input"
                    value={sanityProject}
                    placeholder="e.g. n3plha5r"
                    autoFocus
                    onChange={(e) => setSanityProject(e.target.value)}
                  />
                  <label className="wiz-label">Dataset</label>
                  <input
                    className="wiz-input"
                    value={sanityDataset}
                    placeholder="production"
                    onChange={(e) => setSanityDataset(e.target.value)}
                  />
                  <label className="wiz-label">Read token (private datasets only)</label>
                  <input
                    className="wiz-input"
                    type="password"
                    value={sanityToken}
                    placeholder="optional"
                    onChange={(e) => setSanityToken(e.target.value)}
                  />
                  <p className="wiz-hint chi-hint">
                    Public datasets need no token. Anything you enter is stored locally with this
                    client, never sent anywhere but Sanity.
                  </p>
                </>
              ) : owned ? (
                <div className="chi-owned">
                  Reads from {profile?.website || 'the brand site'}. No login needed.
                </div>
              ) : (
                <>
                  <label className="wiz-label">{label} profile URL</label>
                  <input
                    className="wiz-input"
                    value={urlInput}
                    placeholder={`e.g. ${cfg?.platform?.toLowerCase() ?? channel}.com/theirhandle`}
                    onChange={(e) => setUrlInput(e.target.value)}
                  />

                  <div className="chi-connect-row">
                    {connected ? (
                      <span className="setup-connected">✓ logged in — Claude reads it authenticated</span>
                    ) : connectToken ? (
                      <button className="btn sm primary" onClick={saveConnect}>
                        I've logged in, save
                      </button>
                    ) : (
                      <button className="btn sm" disabled={!urlInput.trim()} onClick={startConnect}>
                        Log in once (recommended)
                      </button>
                    )}
                  </div>
                  <p className="wiz-hint chi-hint">
                    Logging in once lets Claude read login-walled channels (your password goes to the
                    platform, never to us). You can skip it and read whatever is public.
                  </p>
                </>
              )}

              {error && error.code !== 'NO_KEY' && (
                <div className="chi-note warn">
                  {error.code === 'LOGIN_REQUIRED'
                    ? `${label} needs a login to read. Log in once above, then ingest.`
                    : error.message}
                </div>
              )}

              <button className="btn primary chi-ingest" disabled={!canIngest} onClick={runIngest}>
                ✦ Ingest all copy →
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

/** The ingest payoff: mapped messages, with the copy lifted out of the art shown. */
function ChannelResult({
  label,
  onClose,
  onReingest,
  ingesting,
}: {
  label: string
  onClose: () => void
  onReingest: () => void
  ingesting: boolean
}) {
  const result = useTrafficStore((s) => s.channelIngestResult)
  if (!result) return null
  const withArt = result.messages.filter((m) => m.extractedCopy?.trim())

  return (
    <div className="chi-result">
      <div className="chi-result-head">
        <strong>{result.messages.length}</strong> live message{result.messages.length === 1 ? '' : 's'} from {label}
        {result.imagesTranscribed > 0 && (
          <span className="chi-art-count">· read the copy in {result.imagesTranscribed} image{result.imagesTranscribed === 1 ? '' : 's'}</span>
        )}
      </div>

      {result.voice && (
        <div className="chi-voice">
          <span className="chi-k">Voice here</span>
          {result.voice}
        </div>
      )}

      <ul className="chi-msgs">
        {result.messages.map((m, i) => (
          <li key={i} className="chi-msg">
            <div className="chi-msg-head">{m.headline}</div>
            {m.audience && <span className="chi-msg-aud">{m.audience}</span>}
            {m.extractedCopy?.trim() && (
              <div className="chi-art">
                <span className="chi-art-k">In the art</span>
                <span className="chi-art-text">{m.extractedCopy.trim()}</span>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="chi-result-foot">
        <span className="wiz-hint">
          Added to {label}'s live messaging{withArt.length ? `, ${withArt.length} with copy lifted from the art` : ''}.
        </span>
        <span className="spacer" />
        <button className="btn sm" disabled={ingesting} onClick={onReingest}>
          Re-ingest
        </button>
        <button className="btn primary sm" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
