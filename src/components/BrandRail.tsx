import { useEffect, useState } from 'react'
import { can } from '../domain/access'
import { createInvite, signOut } from '../lib/session'
import { useTrafficStore } from '../store/useTrafficStore'
import { readTheme, setTheme, type ThemeChoice } from '../lib/theme'

/**
 * BrandRail — the far-left vertical rail. Brands no longer live here as tiles: they open as tabs in
 * the canvas tab strip (like campaigns). The rail now holds the middle nav (its `children`) and the
 * workspace foot (invite, account, settings). It still keeps the scope pinned to a real brand.
 */

const RailIco = ({ children, size = 18 }: { children: React.ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

export function BrandRail({ children, iconsOnly = false }: { children?: React.ReactNode; iconsOnly?: boolean } = {}) {
  /**
   * Three widths, and the labels are what decide between them.
   *
   * 68 for the labelled nav, because "Campaigns" is the longest label and has to stay on one line
   * at the .railnav font size. 52 inside a campaign, where the nav is icons only and the width has
   * nothing to size around but the icon and its hit area. 44 with no nav at all.
   */
  const railW = children ? (iconsOnly ? 52 : 68) : 44
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setPage = useTrafficStore((s) => s.setPage)
  const openInvite = useTrafficStore((s) => s.openInvite)
  const role = useTrafficStore((s) => s.role)
  const brandRecords = useTrafficStore((s) => s.brandRecords)
  const brandNames = brandRecords.map((b) => b.name.trim()).filter((n) => n && n !== 'New brand')

  // The app is always scoped to a real brand (there's no "all" portfolio view here).
  useEffect(() => {
    if (clientFilter === 'all' && brandNames.length) setClientFilter(brandNames[0])
  }, [clientFilter, brandNames, setClientFilter])

  // The account/settings dropdown anchored to the "C" avatar at the foot.
  const [acctOpen, setAcctOpen] = useState(false)
  // Mirrors what main.tsx already applied, so the segmented control opens on the real state.
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => readTheme())
  // The invite popover anchored to the "add teammate" button — same anchored-card pattern as the C menu.
  const [inviteMenuOpen, setInviteMenuOpen] = useState(false)
  const [inviteRole, setInviteRole] = useState<'editor' | 'stakeholder'>('editor')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [inviteErr, setInviteErr] = useState('')
  const openInviteMenu = () => {
    setInviteLink('')
    setInviteErr('')
    setInviteCopied(false)
    setAcctOpen(false)
    setInviteMenuOpen(true)
  }
  const genInvite = async () => {
    setInviteBusy(true)
    setInviteErr('')
    const token = await createInvite(inviteRole)
    setInviteBusy(false)
    if (!token) {
      setInviteErr('Could not create an invite. Make sure the backend is connected.')
      return
    }
    setInviteLink(`${window.location.origin}/?invite=${token}`)
  }
  const copyInvite = () => {
    void navigator.clipboard?.writeText(inviteLink)
    setInviteCopied(true)
    window.setTimeout(() => setInviteCopied(false), 1500)
  }
  return (
    <>
    <div style={{ width: railW, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 4px', borderRight: '1px solid var(--border)', background: 'var(--surface-2, #f7f4f8)', minHeight: 0, overflowY: 'auto' }}>
      {children}

      <div style={{ flex: 1 }} />

      <button title="Invite a teammate" aria-haspopup="menu" aria-expanded={inviteMenuOpen} onClick={() => (inviteMenuOpen ? setInviteMenuOpen(false) : openInviteMenu())} style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', flex: '0 0 auto', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text, #1a2023)', boxShadow: inviteMenuOpen ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent, #0e6d84)' : undefined }}>
        <RailIco size={18}><circle cx="9" cy="8" r="3" /><path d="M4 20a5 5 0 0 1 10 0" /><path d="M19 8v6M22 11h-6" /></RailIco>
      </button>
      <button title="Account & settings" aria-haspopup="menu" aria-expanded={acctOpen} onClick={() => setAcctOpen((o) => !o)} style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', flex: '0 0 auto', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text, #1a2023)', fontWeight: 700, fontSize: 12, boxShadow: acctOpen ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent, #0e6d84)' : undefined }}>
        C
      </button>
    </div>

    {acctOpen && (
      <>
        <div onClick={() => setAcctOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
        <div role="menu" style={{ position: 'fixed', left: railW + 6, bottom: 12, zIndex: 61, width: 236, padding: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 10px 30px rgba(16,24,40,.16), 0 2px 6px rgba(16,24,40,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px' }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'var(--accent, #0e6d84)', color: '#fff', fontWeight: 800, fontSize: 12, flex: '0 0 auto' }}>C</span>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>Chris</span>
          </div>
          <div className="hsb-ws-sep" />
          <button className="hsb-ws-mi" role="menuitem" onClick={() => { setPage('account'); setAcctOpen(false) }}>
            <span className="hsb-ws-mi-ic"><RailIco><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></RailIco></span>
            Account settings
          </button>
          <button className="hsb-ws-mi" role="menuitem" onClick={() => { openInvite(); setAcctOpen(false) }}>
            <span className="hsb-ws-mi-ic"><RailIco><circle cx="9" cy="8" r="3" /><path d="M4 20a5 5 0 0 1 10 0" /><path d="M19 8v6M22 11h-6" /></RailIco></span>
            Invite a teammate
          </button>
          <button className="hsb-ws-mi" role="menuitem" onClick={() => { setPage('connectors'); setAcctOpen(false) }}>
            <span className="hsb-ws-mi-ic"><RailIco><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></RailIco></span>
            Apps and integrations
          </button>
          {can(role, 'billing') && (
            <button className="hsb-ws-mi" role="menuitem" onClick={() => { setPage('billing'); setAcctOpen(false) }}>
              <span className="hsb-ws-mi-ic"><RailIco><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></RailIco></span>
              Billing
            </button>
          )}
          {/* Appearance. Three states rather than a two-way switch, because "follow the system" is a
              real answer and a plain toggle cannot express it: it would silently pin whichever way
              the OS happened to be on the day you first used it. */}
          <div className="hsb-ws-sep" />
          <div className="theme-row" role="group" aria-label="Appearance">
            <span className="theme-row-label">Appearance</span>
            <div className="theme-seg">
              {(['light', 'dark', 'system'] as const).map((c) => (
                <button
                  key={c}
                  className={`theme-seg-btn${themeChoice === c ? ' on' : ''}`}
                  aria-pressed={themeChoice === c}
                  onClick={() => { setTheme(c); setThemeChoice(c) }}
                >
                  {c === 'system' ? 'Auto' : c === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
          </div>
          <div className="hsb-ws-sep" />
          <button className="hsb-ws-mi" role="menuitem" onClick={() => { window.open('/changelog', '_blank', 'noopener'); setAcctOpen(false) }}>
            <span className="hsb-ws-mi-ic"><RailIco><path d="M12 3l2.2 5.4L20 9.3l-4 3.9 1 5.6L12 16.9 7 18.8l1-5.6-4-3.9 5.8-.9z" /></RailIco></span>
            What&rsquo;s new
          </button>
          <div className="hsb-ws-sep" />
          <button className="hsb-ws-mi" role="menuitem" onClick={() => { setAcctOpen(false); void signOut() }}>
            <span className="hsb-ws-mi-ic"><RailIco><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></RailIco></span>
            Sign out
          </button>
        </div>
      </>
    )}

    {inviteMenuOpen && (
      <>
        <div onClick={() => setInviteMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
        <div role="menu" style={{ position: 'fixed', left: railW + 6, bottom: 46, zIndex: 61, width: 248, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 10px 30px rgba(16,24,40,.16), 0 2px 6px rgba(16,24,40,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'var(--accent, #0e6d84)', color: '#fff', flex: '0 0 auto' }}>
              <RailIco size={15}><circle cx="9" cy="8" r="3" /><path d="M4 20a5 5 0 0 1 10 0" /><path d="M19 8v6M22 11h-6" /></RailIco>
            </span>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>Invite a teammate</span>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.4, color: 'var(--text-muted, #5a6b72)' }}>Share a link that lets someone join this workspace. They sign in, and they&rsquo;re in.</p>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #5a6b72)', marginBottom: 4 }}>Their role</label>
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'editor' | 'stakeholder')} style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, marginBottom: 10 }}>
            <option value="editor">Editor — can view and edit</option>
            <option value="stakeholder">Stakeholder — view only</option>
          </select>
          {!inviteLink ? (
            <button className="btn primary" disabled={inviteBusy} onClick={genInvite} style={{ width: '100%' }}>
              {inviteBusy ? 'Creating…' : 'Create invite link'}
            </button>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                <input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0, padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2, #f7f4f8)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 12 }} />
                <button onClick={copyInvite} style={{ flex: '0 0 auto', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>{inviteCopied ? '✓ Copied' : 'Copy'}</button>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 11, lineHeight: 1.4, color: 'var(--text-muted, #5a6b72)' }}>Anyone with this link who signs in joins as {inviteRole}. Create a fresh link per person.</p>
            </>
          )}
          {inviteErr && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger, #c0392b)' }}>{inviteErr}</div>}
        </div>
      </>
    )}

    </>
  )
}
