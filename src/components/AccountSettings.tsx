import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useTrafficStore } from '../store/useTrafficStore'
import { firstNameOf, getSession, onAuthChange } from '../lib/session'
import { SKILL_LEVELS, MARKETER_ROLES } from '../domain/userPrefs'

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

// A lightweight personal profile, stored locally (no server profile yet). Blank when unset:
// this file ships to every deployment, so a default name here would be one real person's name
// sitting in everybody else's Settings. The signed-in account fills the gap instead.
const ACCOUNT_KEY = 'stoplight.account.v1'
type Account = { firstName: string; lastName: string; email: string }
/** Whether this person has ever saved their profile, as opposed to simply having blank fields. */
function hasSavedAccount(): boolean {
  try {
    return localStorage.getItem(ACCOUNT_KEY) !== null
  } catch {
    return false
  }
}
function loadAccount(): Account {
  try {
    const raw = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}')
    return { firstName: raw.firstName ?? '', lastName: raw.lastName ?? '', email: raw.email ?? '' }
  } catch {
    return { firstName: '', lastName: '', email: '' }
  }
}

function ProfileSection() {
  const [acct, setAcct] = useState<Account>(loadAccount)
  // True once this person has saved anything, including saving a field as empty. Seeded from
  // storage so it survives a remount, which is exactly when the naive version misbehaves.
  const savedOnce = useRef(hasSavedAccount())
  // Fill the blanks from the signed-in account. Gap-filling only, so anything already typed wins
  // and clearing a field leaves it cleared instead of snapping back to the session value. Signed
  // out, or with no backend configured, nothing arrives and the placeholders show.
  useEffect(() => {
    let live = true
    const apply = (u: User | null) => {
      if (!live) return
      // Only ever fills an account that has NEVER been saved.
      //
      // The tempting version fills any blank field, and it is wrong in a way that is easy to miss:
      // an empty field means two different things. Never typed, or deliberately cleared. Filling
      // both means clearing your first name puts it back the next time this section remounts, and
      // switching to Appearance and back is enough to remount it.
      if (savedOnce.current) return
      setAcct((prev) => ({ ...prev, firstName: prev.firstName || firstNameOf(u), email: prev.email || u?.email || '' }))
    }
    void getSession().then((s) => apply(s?.user ?? null))
    const off = onAuthChange(apply)
    return () => {
      live = false
      off()
    }
  }, [])
  const save = (next: Account) => {
    savedOnce.current = true
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
          <input className="library-input" placeholder="First name" value={acct.firstName} onChange={(e) => save({ ...acct, firstName: e.target.value })} />
        </label>
        <label className="library-field">
          <span className="library-field-label">Last name</span>
          <input className="library-input" placeholder="Last name" value={acct.lastName} onChange={(e) => save({ ...acct, lastName: e.target.value })} />
        </label>
      </div>
      <label className="library-field">
        <span className="library-field-label">Primary email address</span>
        <input className="library-input" placeholder="you@yourcompany.com" value={acct.email} onChange={(e) => save({ ...acct, email: e.target.value })} />
      </label>
    </div>
  )
}

function Placeholder({ label }: { label: string }) {
  return <div className="acct-empty">{label} settings are coming soon.</div>
}

/** Skill level (how much shows) + marketer role (what leads). Both only set defaults; nothing is
 *  removed, so a neutral choice is today's full UI. */
function AppearanceSection() {
  const userPrefs = useTrafficStore((s) => s.userPrefs)
  const setUserPrefs = useTrafficStore((s) => s.setUserPrefs)
  return (
    <div className="acct-prefs">
      <div className="acct-pref">
        <div className="acct-pref-label">Detail level</div>
        <div className="acct-pref-hint">How much of each screen shows. Nothing is ever removed; Simple tucks the advanced fields behind an expander you can open anytime.</div>
        <div className="acct-seg">
          {SKILL_LEVELS.map((s) => (
            <button
              key={s.value}
              className={`acct-seg-btn${userPrefs.skillLevel === s.value ? ' on' : ''}`}
              onClick={() => setUserPrefs({ skillLevel: s.value })}
              title={s.hint}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="acct-pref">
        <div className="acct-pref-label">Focus</div>
        <div className="acct-pref-hint">Which objects, metrics, and words lead. Everything stays reachable; this only sets your default landing surface and emphasis.</div>
        <div className="acct-seg acct-seg-wrap">
          <button
            className={`acct-seg-btn${!userPrefs.marketerRole ? ' on' : ''}`}
            onClick={() => setUserPrefs({ marketerRole: null })}
            title="No role emphasis — the full, neutral UI."
          >
            No focus
          </button>
          {MARKETER_ROLES.map((r) => (
            <button
              key={r.value}
              className={`acct-seg-btn${userPrefs.marketerRole === r.value ? ' on' : ''}`}
              onClick={() => setUserPrefs({ marketerRole: r.value })}
              title={r.hint}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
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
      case 'appearance':
        return <AppearanceSection />
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
