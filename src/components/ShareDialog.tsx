import { useEffect, useState } from 'react'
import { SHARE_ACCESS, SHAREABLE_ROLES, type ShareableRole } from '../domain/access'
import { encodeShareToken, shareUrl } from '../lib/shareLink'
import { publishShareSnapshot } from '../lib/shareSnapshot'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Owner-only. ONE link per campaign (or per brand) at each access level, ready to copy the
 * moment the dialog opens.
 *
 * It used to mint them. You picked a role from two cards, pressed Create, then pressed Copy,
 * and every Create added another row to a list of opaque ids you could not tell apart, so
 * revoking the right one was guesswork and the extra links bought nothing that one link did
 * not. Handing out a campaign is a single link, so the dialog reuses it instead of stacking
 * new ones, and the access choice moved to a two-option switch under the link rather than a
 * decision standing in front of it.
 */
export function ShareDialog() {
  const open = useTrafficStore((s) => s.shareDialogOpen)
  const close = useTrafficStore((s) => s.closeShareDialog)
  const client = useTrafficStore((s) => s.clientFilter)
  const campaign = useTrafficStore((s) => s.shareDialogCampaign)
  const shares = useTrafficStore((s) => s.shares)
  const createShare = useTrafficStore((s) => s.createShare)
  const revokeShare = useTrafficStore((s) => s.revokeShare)

  const [role, setRole] = useState<ShareableRole>('stakeholder')
  const [copied, setCopied] = useState(false)
  // Stop sharing has to outlast the mint-on-open effect below, or pressing it would hand
  // straight back the link it just revoked.
  const [stopped, setStopped] = useState(false)

  // A campaign share shows that campaign's links; a brand share shows the brand-level
  // (campaign-less) ones. Newest first, because createShare prepends.
  const scoped = shares.filter((s) => s.client === client && (campaign ? s.campaign === campaign : !s.campaign))
  const atRole = scoped.filter((s) => s.role === role)
  const link = atRole[0] ?? null
  // Duplicates left over from the dialog that could stack any number of links. Nothing else
  // surfaces them now, and a live grant nobody can see is a live grant nobody can revoke.
  const extra = atRole.slice(1)
  // 'all' is not a brand, so there is nothing to scope a link to. Reachable from the
  // workspace Share button before a brand is picked.
  const shareable = !!client && client !== 'all'

  useEffect(() => setCopied(false), [role, link?.id])
  useEffect(() => setStopped(false), [open, campaign, client])

  useEffect(() => {
    if (!open || stopped || !shareable) return
    if (!link) {
      createShare(client, role, campaign ?? undefined)
      return
    }
    // Opening republishes, so a recipient sees the campaign as it stands now. This used to
    // be a Refresh button, which only worked if the owner knew a share is a point-in-time
    // snapshot and thought to press it.
    void publishShareSnapshot(useTrafficStore.getState(), link.client, link.role, link.id, link.campaign)
  }, [open, stopped, shareable, link, client, role, campaign, createShare])

  if (!open) return null

  const subject = campaign ? campaign.replace(`${client} — `, '') : client
  const noun = campaign ? 'campaign' : 'workspace'
  const url = link
    ? shareUrl(encodeShareToken({ client: link.client, role: link.role, id: link.id, campaign: link.campaign }))
    : ''

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      /* clipboard blocked; the field is selectable as a fallback */
    }
  }
  const dismiss = () => {
    setCopied(false)
    close()
  }
  const stop = () => {
    for (const s of atRole) revokeShare(s.id)
    setStopped(true)
    setCopied(false)
  }

  return (
    <>
      <div className="share-scrim" onClick={dismiss} />
      <div className="share-dialog" role="dialog" aria-label={`Share ${subject}`}>
        <div className="share-head">
          <span className="share-title">Share {subject}</span>
          <button className="share-x" onClick={dismiss} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="share-sub">
          Anyone with this link can {SHARE_ACCESS[role].can} this {noun}. No account needed.
        </p>

        {!shareable ? (
          <div className="share-blocked">Pick a brand first, then share.</div>
        ) : link ? (
          <div className="share-link-row">
            <input className="share-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn sm primary share-copy" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <button className="btn primary share-make" onClick={() => setStopped(false)}>
            Create a link
          </button>
        )}

        {shareable && (
          <div className="share-foot">
            <div className="share-access" role="group" aria-label="Link access">
              {SHAREABLE_ROLES.map((r) => (
                <button
                  key={r}
                  className={`share-access-opt${role === r ? ' on' : ''}`}
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                >
                  {SHARE_ACCESS[r].label}
                </button>
              ))}
            </div>
            {link && (
              <button className="share-stop" onClick={stop}>
                Stop sharing
              </button>
            )}
          </div>
        )}

        {extra.length > 0 && (
          <div className="share-extra">
            <span>
              {extra.length} older link{extra.length > 1 ? 's' : ''} still open{extra.length > 1 ? '' : 's'} this {noun}.
            </span>
            <button className="share-extra-revoke" onClick={() => extra.forEach((s) => revokeShare(s.id))}>
              Revoke
            </button>
          </div>
        )}
      </div>
    </>
  )
}
