import { useEffect, useState } from 'react'
import { createInvite } from '../lib/session'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Invite teammate — generates a shareable link that lets another signed-in user join this
 * workspace (see claim_invite). The invitee opens the link, signs up / in, and lands in this
 * workspace with the chosen role. No emails or server keys: the link IS the invite.
 */
export function InviteModal() {
  const open = useTrafficStore((s) => s.inviteOpen)
  const close = useTrafficStore((s) => s.closeInvite)
  const [role, setRole] = useState<'editor' | 'stakeholder'>('editor')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')

  // Reset when reopened.
  useEffect(() => {
    if (open) {
      setLink('')
      setErr('')
      setCopied(false)
    }
  }, [open])

  if (!open) return null

  const generate = async () => {
    setBusy(true)
    setErr('')
    const token = await createInvite(role)
    setBusy(false)
    if (!token) {
      setErr('Could not create an invite. Make sure the backend is connected.')
      return
    }
    setLink(`${window.location.origin}/?invite=${token}`)
  }
  const copy = () => {
    void navigator.clipboard?.writeText(link)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="auth-gate invite-scrim" onClick={close}>
      <div className="auth-card invite-card" onClick={(e) => e.stopPropagation()}>
        <div className="invite-head">
          <span className="fchat-spark" aria-hidden="true">✦</span>
          <span className="invite-title">Invite a teammate</span>
          <button className="invite-x" onClick={close} aria-label="Close">×</button>
        </div>
        <p className="invite-sub">Share a link that lets someone join <strong>this workspace</strong> and see the same data. They sign in, and they&rsquo;re in.</p>

        <label className="invite-field">
          <span>Their role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'stakeholder')}>
            <option value="editor">Editor — can view and edit</option>
            <option value="stakeholder">Stakeholder — view only</option>
          </select>
        </label>

        {!link ? (
          <button className="btn primary invite-generate" disabled={busy} onClick={generate}>
            {busy ? 'Creating…' : 'Create invite link'}
          </button>
        ) : (
          <>
            <div className="invite-linkrow">
              <input className="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <button className="invite-copy" onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
            </div>
            <p className="invite-note">Anyone with this link who signs in joins as {role}. Create a fresh link per person.</p>
          </>
        )}
        {err && <div className="auth-err">{err}</div>}
      </div>
    </div>
  )
}
