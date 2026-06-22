import { useState } from 'react'
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

export function SetupWizard() {
  const open = useTrafficStore((s) => s.setupOpen)
  const close = useTrafficStore((s) => s.closeSetup)
  const setPage = useTrafficStore((s) => s.setPage)
  const provisionCurrentState = useTrafficStore((s) => s.provisionCurrentState)
  const addClient = useTrafficStore((s) => s.addClient)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)

  const [step, setStep] = useState<Step>('input')
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

  if (!open) return null

  const reset = () => {
    setStep('input')
    setStages([])
    setMap(null)
    setError(null)
    setProvisioning(false)
    setConnecting({})
    setConnected(new Set())
    setExtraAccounts([])
    setAccountInput('')
  }
  const onClose = () => {
    close()
    reset()
    setUrl('')
    setNotes('')
  }

  const run = async () => {
    setStep('mapping')
    setStages([])
    setError(null)
    try {
      const m = await mapSiteStream(
        { url: url.trim(), notes: notes.trim() || undefined, accounts: extraAccounts },
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
    onClose()
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
    onClose()
  }

  const channels = map ? [...new Set(map.messages.map((m) => m.channel as ChannelId))] : []
  // Every account to connect: discovered on the site + ones you add by hand.
  const discoveredAccounts = map
    ? Object.entries(map.socials ?? {}).filter(([p]) => p !== 'facebook').map(([, u]) => u)
    : []
  const allAccounts = [...new Set([...discoveredAccounts, ...extraAccounts])]

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="wiz setup-wiz" role="dialog" aria-label="Map a client from their site">
        <div className="wiz-head">
          <span className="setup-badge">✦ Map a client from their site</span>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>

        {step === 'input' && (
          <div className="wiz-body">
            <div className="setup-intro">
              <h3>Map their live messaging</h3>
              <p className="wiz-hint">
                Point Claude at their site. It reads everything publicly live, their site and their
                running ads, and maps their whole messaging presence: voice, audiences, claims, and
                proof. You see the map and confirm before anything is committed.
              </p>
            </div>

            <label className="wiz-label">Company website</label>
            <input
              className="wiz-input"
              value={url}
              placeholder="acme.com"
              autoFocus
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && url.trim() && run()}
            />

            <label className="wiz-label">Anything Claude should know? (optional)</label>
            <textarea
              className="wiz-input wiz-textarea"
              value={notes}
              placeholder="e.g. focus on their B2B line, ignore the legacy blog"
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="setup-sources">
              Connect Claude, Attio, and your ad platforms on{' '}
              <button
                className="wiz-link"
                onClick={() => {
                  onClose()
                  setPage('connectors')
                }}
              >
                Connectors
              </button>{' '}
              so Claude can pull more. Optional.
            </div>

            {url.trim() && (
              <button className="wiz-link setup-byname" onClick={addByName}>
                No website? Add "{url.trim()}" by name instead →
              </button>
            )}

            <div className="wiz-foot">
              <span className="wiz-hint">Nothing is committed until you review the map.</span>
              <span className="spacer" />
              <button className="btn primary" disabled={!url.trim()} onClick={run}>
                ✦ Map their messaging →
              </button>
            </div>
          </div>
        )}

        {step === 'mapping' && (
          <div className="wiz-body setup-generating">
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
              <div className="setup-error">
                {error}{' '}
                <button className="wiz-link" onClick={() => setStep('input')}>
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'review' && map && (
          <div className="wiz-body">
            <p className="wiz-hint setup-review-intro">
              Here's what we pulled from {map.brand.website || url}. Look right?
            </p>

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

            <div className="wiz-label setup-section-plain">Channels their messaging lives on</div>
            <div className="setup-channel-list">
              {channels.map((c) => (
                <span key={c} className="setup-channel on">
                  <ChannelIcon channel={c} size={13} />
                  {c}
                </span>
              ))}
            </div>

            <div className="wiz-label setup-section-plain">Their channels</div>
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
            <div className="wiz-hint setup-socials-note">
              Connect logs you into that channel once (your password goes to the platform, never to us),
              then Claude reads it like the website. Add any account you want, connect each, then re-map.
            </div>

            <div className="setup-mapstats">
              {map.messages.length} live messages · {map.proofPoints.length} proof points
            </div>
            <div className="setup-rtbs">
              {map.proofPoints.slice(0, 6).map((r, i) => (
                <div key={i} className="setup-rtb">
                  <span className="setup-rtb-label">{r.label}</span>
                  <span className="setup-rtb-detail">{r.detail}</span>
                </div>
              ))}
            </div>

            <div className="wiz-foot">
              <button className="btn sm" onClick={() => setStep('input')}>
                ← Start over
              </button>
              <span className="wiz-hint">Nothing is committed until you build the map.</span>
              <span className="spacer" />
              <button className="btn primary" disabled={provisioning} onClick={provision}>
                {provisioning ? 'Building…' : 'Build the map ↓'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
