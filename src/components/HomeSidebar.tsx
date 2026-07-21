import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import { InfoTip } from './InfoTip'

// Which glossary term defines each collapsible nav section (build -> reach -> measure).
const SECTION_TERM: Record<string, string> = { Foundation: 'foundation', Prospects: 'prospects', 'Go-to-market': 'gtm' }

/**
 * The app's left sidebar for the files-browser shell — the same panel on the home
 * AND on the Library / Connectors / Billing pages, so the layout never changes
 * between them. A workspace header, a Quick-actions + search row over the Ask
 * palette, the primary destinations, a recent-Chats list (saved reports), and the
 * Connect / Billing foot. Self-contained: reads counts + brands from the shared
 * hook and drives navigation via the store.
 */

// Thin line icons on a 24 grid; they inherit color via currentColor.
const ICONS: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h5v-5h2v5h5v-9" />
    </>
  ),
  brand: <path d="M12 2 22 12 12 22 2 12Z" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3.5v3M16 3.5v3" />
    </>
  ),
  library: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.3" />
      <rect x="13" y="4" width="7" height="7" rx="1.3" />
      <rect x="4" y="13" width="7" height="7" rx="1.3" />
      <rect x="13" y="13" width="7" height="7" rx="1.3" />
    </>
  ),
  insights: (
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-5" />
      <path d="M12 20V8" />
      <path d="M17 20v-9" />
    </>
  ),
  reports: (
    <>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
      <path d="M10 13h6M10 17h5" />
    </>
  ),
  tasks: (
    <>
      <path d="m3 7 2 2 3-3" />
      <path d="m3 16 2 2 3-3" />
      <path d="M12 8h9M12 17h9" />
    </>
  ),
  campaigns: (
    <>
      <rect x="4" y="4" width="6" height="16" rx="1.4" />
      <rect x="14" y="4" width="6" height="10" rx="1.4" />
    </>
  ),
  companies: (
    <>
      <rect x="4" y="3" width="9" height="18" rx="1.4" />
      <path d="M13 8h7v13H4" />
      <path d="M7 7h3M7 11h3M7 15h3M16 12h0M16 16h0" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M4 20a5 5 0 0 1 10 0" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6" />
      <path d="M17 14.5a5 5 0 0 1 3 5.5" />
    </>
  ),
  segments: (
    <>
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="m2 13 10 5 10-5" />
    </>
  ),
  flows: (
    <>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M6 8.4v3a2 2 0 0 0 2 2h2.4M18 8.4v3a2 2 0 0 1-2 2h-2.4" />
    </>
  ),
  media: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9h9" />
    </>
  ),
  connect: (
    <>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.5 12 5.5a3.5 3.5 0 0 1 5 5l-1 1" />
      <path d="M13 17.5l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
    </>
  ),
  billing: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  chat: <path d="M20 4H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4v3l4-3h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  spark: <path d="M12 4l1.7 4.8L18.5 12l-4.8 1.7L12 18.5l-1.7-4.8L5.5 12l4.8-1.7z" />,
  caret: <path d="m6 9 6 6 6-6" />,
  updown: <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />,
  check: <path d="m5 12.5 4.5 4.5L19 6" />,
  pattern: (
    <>
      <path d="M4 7h16M4 12h16M4 17h10" />
      <circle cx="18.5" cy="17" r="2" />
    </>
  ),
  trigger: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  voices: (
    <>
      <path d="M4 5h16v11H8l-4 3z" />
      <path d="M9 10v2M12 8.5v5M15 10v2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.6v2.6M12 18.8v2.6M4 7.6l2.2 1.3M17.8 15.1l2.2 1.3M4 16.4l2.2-1.3M17.8 8.9 20 7.6" />
    </>
  ),
  userplus: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M18 8.5v5M15.5 11h5" />
    </>
  ),
  apps: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
    </>
  ),
  signout: (
    <>
      <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
      <path d="m10 8-4 4 4 4" />
      <path d="M16 12H6" />
    </>
  ),
}

// Open / overdue task counts for the sidebar badge. Tasks live in localStorage (see TasksView),
// so read them straight from there; TasksView fires a 'stoplight:tasks' event on every change.
function readTaskCounts(brand: string): { open: number; overdue: number } {
  try {
    const raw = JSON.parse(localStorage.getItem('stoplight.tasks.v1') ?? '[]')
    if (!Array.isArray(raw)) return { open: 0, overdue: 0 }
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    // Scope to the active brand; legacy tasks without a brand still count so nothing silently drops.
    const scoped = brand
      ? raw.filter((t: { brand?: string }) => (t.brand ?? '') === brand || !t.brand)
      : raw
    const open = scoped.filter((t: { done?: boolean }) => !t.done)
    return { open: open.length, overdue: open.filter((t: { due?: string }) => t.due && t.due < today).length }
  } catch {
    return { open: 0, overdue: 0 }
  }
}

function Ico({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

// Every top-level nav destination the sidebar can jump to, other than the special Library /
// Insights (libraryMode) and the Brand group (which lists individual brands). Kept as a page key
// so the section config below can drive both the click and the active state from one place.
type NavPage =
  | 'flows' | 'tasks' | 'reports'
  | 'brands' | 'records' | 'people' | 'segments' | 'messages' | 'voices' | 'proofpoints' | 'objectives' | 'channelrecords'

export function HomeSidebar() {
  const page = useTrafficStore((s) => s.page)
  const setPage = useTrafficStore((s) => s.setPage)
  const pageHistory = useTrafficStore((s) => s.pageHistory)
  const goBack = useTrafficStore((s) => s.goBack)
  const reopenOnboarding = useTrafficStore((s) => s.reopenOnboarding)
  const userPrefs = useTrafficStore((s) => s.userPrefs)
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
  const modeLabel = [userPrefs.marketerRole, userPrefs.skillLevel].filter(Boolean).map((x) => cap(x as string)).join(' · ')
  const libraryMode = useTrafficStore((s) => s.libraryMode)
  const setLibraryMode = useTrafficStore((s) => s.setLibraryMode)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const taskBrand = clientFilter && clientFilter !== 'all' ? clientFilter : ''
  const homeChats = useTrafficStore((s) => s.homeChats)
  const activeHomeChatId = useTrafficStore((s) => s.activeHomeChatId)
  const homeChatOpen = useTrafficStore((s) => s.homeChatOpen)
  const newHomeChat = useTrafficStore((s) => s.newHomeChat)
  const openSavedHomeChat = useTrafficStore((s) => s.openSavedHomeChat)
  const deleteHomeChat = useTrafficStore((s) => s.deleteHomeChat)
  const flowCanvasOpen = useTrafficStore((s) => s.flowCanvasOpen)
  const sidebarCollapsed = useTrafficStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useTrafficStore((s) => s.toggleSidebar)
  // A flow canvas forces the rail; otherwise the user's manual toggle decides.
  const railed = flowCanvasOpen || sidebarCollapsed

  const [taskCounts, setTaskCounts] = useState(() => readTaskCounts(taskBrand))
  const [chatsOpen, setChatsOpen] = useState(false)
  // Workflow sections (Foundation / Prospects / Go-to-market) — collapsed by default so the nav starts
  // compact; the user expands what they need.
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set<string>())
  const toggleSection = (label: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  // The nav, organized by the job stages: set a Foundation → Build → reach (Go-to-market) → Measure.
  type NavItem = { key: string; label: string; ico: string; page: NavPage | null; active: boolean; onClick: () => void; badge?: number; overdue?: boolean }
  const item = (key: string, label: string, ico: string, active: boolean, onClick: () => void, extra?: { badge?: number; overdue?: boolean }): NavItem =>
    ({ key, label, ico, page: null, active, onClick, ...extra })
  // Build lives at the top as flat items (like Home) — not under a collapsible header.
  const topItems: NavItem[] = [
    // "Brand" opens this brand's own strategy record (single-brand only, never the every-brand list).
    item('brands', 'Brand', 'brand', page === 'brands', () => setPage('brands')),
    item('flows', 'Campaigns', 'flows', page === 'flows', () => setPage('flows')),
    item('calendar', 'Timeline', 'calendar', page === 'calendar', () => setPage('calendar')),
    item('tasks', 'Tasks', 'tasks', page === 'tasks', () => setPage('tasks'), { badge: taskCounts.open || undefined, overdue: taskCounts.overdue > 0 }),
    item('library', 'Library', 'library', page === 'content' && libraryMode === 'catalog', () => setLibraryMode('catalog')),
    item('insights', 'Insights', 'insights', page === 'reports' || (page === 'content' && libraryMode !== 'catalog'), () => setLibraryMode('data')),
  ]
  const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
    {
      label: 'Foundation',
      items: [
        item('messages', 'Messages', 'reports', page === 'messages', () => setPage('messages')),
        item('voices', 'Voices', 'voices', page === 'voices', () => setPage('voices')),
        item('proofpoints', 'Proof points', 'check', page === 'proofpoints', () => setPage('proofpoints')),
        item('patterns', 'Patterns', 'pattern', page === 'patterns', () => setPage('patterns')),
      ],
    },
    {
      label: 'Prospects',
      items: [
        item('segments', 'Audiences', 'segments', page === 'segments', () => setPage('segments')),
        item('records', 'Companies', 'companies', page === 'records', () => setPage('records')),
        item('people', 'People', 'people', page === 'people', () => setPage('people')),
      ],
    },
    {
      label: 'Go-to-market',
      items: [
        item('channelrecords', 'Channels', 'flows', page === 'channelrecords', () => setPage('channelrecords')),
        item('triggers', 'Triggers', 'trigger', page === 'triggers', () => setPage('triggers')),
        item('objectives', 'Objectives', 'insights', page === 'objectives', () => setPage('objectives')),
      ],
    },
  ]

  // Home chat history (already newest-activity-first from the store), capped for the sidebar.
  const recentChats = useMemo(() => homeChats.slice(0, 12), [homeChats])

  // Keep the Tasks badge in sync: TasksView writes localStorage + fires 'stoplight:tasks'; also
  // refresh when the tab regains focus (another tab may have edited) and when the page changes.
  useEffect(() => {
    const update = () => setTaskCounts(readTaskCounts(taskBrand))
    update()
    window.addEventListener('stoplight:tasks', update)
    window.addEventListener('focus', update)
    return () => {
      window.removeEventListener('stoplight:tasks', update)
      window.removeEventListener('focus', update)
    }
  }, [page, taskBrand])

  return (
    <aside className={`sidebar home-sidebar hsb${railed ? ' hsb-rail' : ''}`}>
      <nav className="sidebar-nav">
        {pageHistory.length > 0 && (
          <button className="nav-item hsb-back" onClick={goBack} title="Back to the previous page">
            <span className="nav-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
            </span>
            <span className="nav-label">Back</span>
          </button>
        )}
        <button
          className={`nav-item${page === 'portfolio' ? ' active' : ''}`}
          onClick={() => setPage('portfolio')}
          title="Home — ask anything, what's due next, and what needs attention"
        >
          <span className="nav-ico">
            <Ico name="home" />
          </span>
          <span className="nav-label">Home</span>
        </button>
        {topItems.map((it) => (
          <button key={it.key} className={`nav-item${it.active ? ' active' : ''}`} onClick={it.onClick} title={it.label}>
            <span className="nav-ico">
              <Ico name={it.ico} />
            </span>
            <span className="nav-label">{it.label}</span>
            {it.badge ? <span className={`nav-count task-badge${it.overdue ? ' overdue' : ''}`}>{it.badge}</span> : null}
          </button>
        ))}
        <div className="hsb-chats hsb-chats-promoted">
          <div className="hsb-sec-row">
            <button className="hsb-sec" onClick={() => setChatsOpen((o) => !o)}>
              <span className={`hsb-sec-chev${chatsOpen ? ' open' : ''}`}>
                <Ico name="caret" />
              </span>
              Chats
              {homeChats.length > 0 ? <span className="nav-count">{homeChats.length}</span> : null}
            </button>
            <button className="hsb-sec-add" title="New chat" aria-label="New chat" onClick={newHomeChat}>
              <Ico name="plus" />
            </button>
          </div>
          {chatsOpen && (
            <div className="hsb-chat-list">
              {recentChats.length === 0 ? (
                <div className="hsb-chat-empty">No chats yet.</div>
              ) : (
                recentChats.map((c) => {
                  const active = homeChatOpen && activeHomeChatId === c.id
                  return (
                    <div key={c.id} className={`hsb-chat${active ? ' active' : ''}`} title={c.title}>
                      <button className="hsb-chat-open" onClick={() => openSavedHomeChat(c.id)}>
                        <span className="hsb-chat-ic">
                          <Ico name="chat" />
                        </span>
                        <span className="hsb-chat-title">{c.title || 'Untitled chat'}</span>
                      </button>
                      <button
                        className="hsb-chat-del"
                        title="Delete chat"
                        aria-label="Delete chat"
                        onClick={(e) => { e.stopPropagation(); deleteHomeChat(c.id) }}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
        {NAV_SECTIONS.map((sec) => {
          const open = openSections.has(sec.label)
          return (
            <div className="hsb-chats" key={sec.label}>
              <div className="hsb-sec-row">
                <button className="hsb-sec" onClick={() => toggleSection(sec.label)}>
                  <span className={`hsb-sec-chev${open ? ' open' : ''}`}>
                    <Ico name="caret" />
                  </span>
                  {sec.label}
                </button>
                <InfoTip term={SECTION_TERM[sec.label]} />
              </div>
              {open && (
                <div className="hsb-chat-list">
                  {sec.items.map((it) => (
                    <button key={it.key} className={`nav-item${it.active ? ' active' : ''}`} onClick={it.onClick} title={it.label}>
                      <span className="nav-ico">
                        <Ico name={it.ico} />
                      </span>
                      <span className="nav-label">{it.label}</span>
                      {it.badge ? (
                        <span className={`nav-count task-badge${it.overdue ? ' overdue' : ''}`}>{it.badge}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="sidebar-foot">
        {modeLabel && (
          <button className="nav-item hsb-modechip" title="Interface preferences (detail level + focus)" onClick={() => setPage('account')}>
            <span className="nav-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></svg>
            </span>
            <span className="nav-label">{modeLabel}</span>
          </button>
        )}
        <a
          className="nav-item hsb-whatsnew"
          href="/changelog"
          target="_blank"
          rel="noopener noreferrer"
          title="See what's new in Breadcrumbs"
        >
          <span className="nav-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l2.2 5.4L20 9.3l-4 3.9 1 5.6L12 16.9 7 18.8l1-5.6-4-3.9 5.8-.9z" />
            </svg>
          </span>
          <span className="nav-label">What&rsquo;s new</span>
        </a>
        <button
          className="nav-item hsb-getstarted"
          title="Reopen the Getting started checklist"
          onClick={() => {
            setPage('portfolio')
            reopenOnboarding()
          }}
        >
          <span className="nav-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 2.5" />
            </svg>
          </span>
          <span className="nav-label">Getting started</span>
        </button>
        {!flowCanvasOpen && (
          <button
            className="nav-item hsb-collapse"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleSidebar}
          >
            <span className="nav-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />
                <path d={sidebarCollapsed ? 'M13 9l2 3-2 3' : 'M15 9l-2 3 2 3'} />
              </svg>
            </span>
            <span className="nav-label">{sidebarCollapsed ? 'Expand' : 'Collapse'}</span>
          </button>
        )}
      </div>

    </aside>
  )
}
