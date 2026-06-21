import { useState } from 'react'
import { ROLE_META, SHAREABLE_ROLES, type Role } from '../domain/access'
import { encodeShareToken, shareUrl } from '../lib/shareLink'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Owner-only. Mints a self-contained share link for the current client at a chosen
 * role and lists the links already handed out, each revocable. The grant lives in
 * the link's token, so a recipient needs no account.
 */
export function ShareDialog() {
  const open = useTrafficStore((s) => s.shareDialogOpen)
  const close = useTrafficStore((s) => s.closeShareDialog)
  const client = useTrafficStore((s) => s.clientFilter)
  const shares = useTrafficStore((s) => s.shares)
  const createShare = useTrafficStore((s) => s.createShare)
  const revokeShare = useTrafficStore((s) => s.revokeShare)

  const [role, setRole] = useState<Role>('stakeholder')
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!open) return null
  const clientShares = shares.filter((s) => s.client === client)

  const make = () => {
    const grant = createShare(client, role)
    setCreated(shareUrl(encodeShareToken({ client: grant.client, role: grant.role, id: grant.id })))
    setCopied(false)
  }
  const copy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created)
      setCopied(true)
    } catch {
      /* clipboard blocked; the field is selectable as a fallback */
    }
  }
  const dismiss = () => {
    setCreated(null)
    setCopied(false)
    close()
  }

  return (
    <>
      <div className="share-scrim" onClick={dismiss} />
      <div className="share-dialog" role="dialog" aria-label="Share workspace">
        <div className="share-head">
          <span className="share-title">Share {client}</span>
          <button className="share-x" onClick={dismiss}>
            ✕
          </button>
        </div>
        <p className="share-sub">
          Generate a link that opens this client's workspace at a fixed role. Anyone with the link
          gets that access, no account needed.
        </p>

        <div className="share-roles">
          {SHAREABLE_ROLES.map((r) => (
            <button key={r} className={`share-role${role === r ? ' on' : ''}`} onClick={() => setRole(r)}>
              <span className="share-role-name">{ROLE_META[r].label}</span>
              <span className="share-role-blurb">{ROLE_META[r].blurb}</span>
            </button>
          ))}
        </div>

        {created ? (
          <div className="share-link-row">
            <input
              className="share-link"
              readOnly
              value={created}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button className="btn sm primary" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="btn sm" onClick={make} title="Mint another link">
              New
            </button>
          </div>
        ) : (
          <button className="btn primary share-make" onClick={make}>
            Create {ROLE_META[role].label} link
          </button>
        )}

        <div className="share-list">
          <div className="share-list-label">
            Active links{clientShares.length ? ` · ${clientShares.length}` : ''}
          </div>
          {clientShares.length === 0 ? (
            <div className="share-empty">No links yet.</div>
          ) : (
            clientShares.map((s) => (
              <div key={s.id} className="share-item">
                <span className={`share-badge r-${s.role}`}>{ROLE_META[s.role].label}</span>
                <span className="share-item-id">{s.id.replace('shr_', '').slice(0, 14)}</span>
                <span className="spacer" />
                <button className="share-revoke" onClick={() => revokeShare(s.id)}>
                  Revoke
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
