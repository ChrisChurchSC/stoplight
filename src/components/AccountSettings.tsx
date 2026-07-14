import { useEffect, useMemo, useState } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Account settings — a full-screen settings surface (left grouped nav + content pane),
 * reached from the workspace dropdown. Rendered outside the HomeShell so it takes over the
 * whole workspace, like a dedicated settings page. (Brand settings live on the dedicated
 * Brand record page, not here.)
 */
type Section = { key: string; label: string; desc?: string }
const GROUPS: { group: string; items: Section[] }[] = [
  {
    group: 'Personal',
    items: [
      { key: 'profile', label: 'Profile', desc: 'Manage your personal details.' },
      { key: 'appearance', label: 'Appearance', desc: 'Theme and display preferences.' },
      { key: 'connections', label: 'Connections', desc: 'Connected apps and integrations.' },
    ],
  },
  {
    group: 'Workspace',
    items: [
      { key: 'general', label: 'General', desc: 'Workspace name and defaults.' },
      { key: 'members', label: 'Members & teams', desc: 'People with access to this workspace.' },
      { key: 'billing', label: 'Billing', desc: 'Plan and payment.' },
    ],
  },
]
const ALL = GROUPS.flatMap((g) => g.items)

// A lightweight personal profile, stored locally (no server account yet).
const ACCOUNT_KEY = 'stoplight.account.v1'
type Account = { firstName: string; lastName: string; email: string }
function loadAccount(): Account {
  try {
    const raw = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}')
    return { firstName: raw.firstName ?? 'Chris', lastName: raw.lastName ?? 'Church', email: raw.email ?? 'chris@super-conscious.studio' }
  } catch {
    return { firstName: 'Chris', lastName: 'Church', email: 'chris@super-conscious.studio' }
  }
}

function ProfileSection() {
  const [acct, setAcct] = useState<Account>(loadAccount)
  const save = (next: Account) => {
    setAcct(next)
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next))
  }
  const initials = ((acct.firstName[0] ?? '') + (acct.lastName[0] ?? '')).toUpperCase() || '?'
  return (
    <div className="acct-form">
      <div className="acct-note">Changes to your profile apply across the workspace.</div>
      <div className="acct-avatar-row">
        <div className="acct-avatar">{initials}</div>
        <div className="acct-avatar-meta">
          <div className="acct-avatar-title">Profile picture</div>
          <div className="acct-avatar-sub">PNG, JPEG or GIF, under 10MB.</div>
        </div>
      </div>
      <div className="acct-grid">
        <label className="library-field">
          <span className="library-field-label">First name</span>
          <input className="library-input" value={acct.firstName} onChange={(e) => save({ ...acct, firstName: e.target.value })} />
        </label>
        <label className="library-field">
          <span className="library-field-label">Last name</span>
          <input className="library-input" value={acct.lastName} onChange={(e) => save({ ...acct, lastName: e.target.value })} />
        </label>
      </div>
      <label className="library-field">
        <span className="library-field-label">Primary email address</span>
        <input className="library-input" value={acct.email} onChange={(e) => save({ ...acct, email: e.target.value })} />
      </label>
    </div>
  )
}

function Placeholder({ label }: { label: string }) {
  return <div className="acct-empty">{label} settings are coming soon.</div>
}

export function AccountSettings() {
  const setPage = useTrafficStore((s) => s.setPage)

  const [section, setSection] = useState('profile')
  const [query, setQuery] = useState('')
  const current = ALL.find((s) => s.key === section) ?? ALL[0]

  // Filter the nav by the search box.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return GROUPS
    return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) })).filter((g) => g.items.length)
  }, [query])

  // If the search hides the selected item, jump to the first visible one.
  useEffect(() => {
    const visible = groups.flatMap((g) => g.items)
    if (visible.length && !visible.some((i) => i.key === section)) setSection(visible[0].key)
  }, [groups, section])

  const content = () => {
    switch (section) {
      case 'profile':
        return <ProfileSection />
      default:
        return <Placeholder label={current.label} />
    }
  }

  return (
    <div className="acct">
      <header className="acct-head">
        <button className="acct-back" onClick={() => setPage('portfolio')} title="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <span className="acct-head-title">Settings</span>
        <span className="acct-head-crumb">{current.label}</span>
      </header>
      <div className="acct-body">
        <nav className="acct-nav">
          <input className="acct-search" placeholder="Search settings…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {groups.map((g) => (
            <div className="acct-nav-group" key={g.group}>
              <div className="acct-nav-group-label">{g.group}</div>
              {g.items.map((i) => (
                <button
                  key={i.key}
                  className={`acct-nav-item${section === i.key ? ' active' : ''}`}
                  onClick={() => setSection(i.key)}
                >
                  {i.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <main className="acct-content">
          <div className="acct-content-head">
            <h1 className="acct-content-title">{current.label}</h1>
            {current.desc && <p className="acct-content-desc">{current.desc}</p>}
          </div>
          {content()}
        </main>
      </div>
    </div>
  )
}
