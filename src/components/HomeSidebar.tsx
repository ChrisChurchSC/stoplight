import { useMemo, useState, type ReactNode } from 'react'
import { can } from '../domain/access'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The app's left sidebar for the files-browser shell — the same panel on the home
 * AND on the Library / Connectors / Billing pages, so the layout never changes
 * between them. A workspace header, a Quick-actions + search row over the Ask
 * palette, the primary destinations, a recent-Chats list (saved reports), and the
 * Connect / Billing foot. Self-contained: reads counts + brands from the shared
 * hook and drives navigation via the store.
 */

// The workspace/org shown in the header (the tenant, above the product). One line to change.
const WORKSPACE = 'Super-conscious'

// Thin line icons on a 24 grid; they inherit color via currentColor.
const ICONS: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h5v-5h2v5h5v-9" />
    </>
  ),
  brand: <path d="M12 2 22 12 12 22 2 12Z" />,
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
  check: <path d="m5 12.5 4.5 4.5L19 6" />,
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

function Ico({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

// Records grouped the way a campaign is built — matches the workbook's Audience / Message /
// Activation sheet groups so the sidebar and the sheet tabs agree.
type RecordPage = 'records' | 'people' | 'segments' | 'messages' | 'proofpoints' | 'objectives' | 'channelrecords'
const RECORD_GROUPS: { label: string; items: { page: RecordPage; label: string; ico: string }[] }[] = [
  {
    label: 'Audience',
    items: [
      { page: 'records', label: 'Companies', ico: 'companies' },
      { page: 'people', label: 'People', ico: 'people' },
      { page: 'segments', label: 'Segments', ico: 'segments' },
    ],
  },
  {
    label: 'Message',
    items: [
      { page: 'messages', label: 'Messages', ico: 'reports' },
      { page: 'proofpoints', label: 'Proof points', ico: 'check' },
    ],
  },
  {
    label: 'Activation',
    items: [
      { page: 'channelrecords', label: 'Channels', ico: 'flows' },
      { page: 'objectives', label: 'Objectives', ico: 'insights' },
    ],
  },
]

export function HomeSidebar() {
  const { brands } = useHomeCanvases()
  const page = useTrafficStore((s) => s.page)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const homeFilter = useTrafficStore((s) => s.homeFilter)
  const setHomeFilter = useTrafficStore((s) => s.setHomeFilter)
  const setPage = useTrafficStore((s) => s.setPage)
  const libraryMode = useTrafficStore((s) => s.libraryMode)
  const setLibraryMode = useTrafficStore((s) => s.setLibraryMode)
  const campaignFolders = useTrafficStore((s) => s.campaignFolders)
  const campaignFolderView = useTrafficStore((s) => s.campaignFolderView)
  const setCampaignFolderView = useTrafficStore((s) => s.setCampaignFolderView)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const deleteClient = useTrafficStore((s) => s.deleteClient)
  const role = useTrafficStore((s) => s.role)
  const reports = useTrafficStore((s) => s.reports)
  const openAsk = useTrafficStore((s) => s.openAsk)
  const flowCanvasOpen = useTrafficStore((s) => s.flowCanvasOpen)
  const sidebarCollapsed = useTrafficStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useTrafficStore((s) => s.toggleSidebar)
  // A flow canvas forces the rail; otherwise the user's manual toggle decides.
  const railed = flowCanvasOpen || sidebarCollapsed

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [chatsOpen, setChatsOpen] = useState(true)
  const [dataOpen, setDataOpen] = useState(true)
  const [recordsOpen, setRecordsOpen] = useState(true)
  // Which record groups (Audience / Message / Activation) are expanded in the sidebar tree. The
  // group holding the current page is always shown; this tracks manual toggles on top of that.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(RECORD_GROUPS.map((g) => g.label)))
  const [wsOpen, setWsOpen] = useState(false)

  const recentChats = useMemo(() => [...reports].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6), [reports])

  // On the gallery when we're at the clients overview (page=clients, no client scoped).
  const onGallery = page === 'clients' && clientFilter === 'all'
  // Brand / Metrics / Library / Channels are brand-scoped destinations: the Brands list
  // picks which brand they show, so a brand click keeps you on the page, not leaves it.
  const brandCtx = page === 'content' || page === 'channels' || page === 'brand' || page === 'reports' || page === 'priorities'
  const go = (filter: string) => {
    setHomeFilter(filter)
    setClientFilter('all')
    if (!brandCtx || filter === 'all' || filter === 'drafts') setPage('portfolio')
  }

  // A brand's campaign folders, nested under its Campaigns entry. Only shown while that
  // brand's gallery is open; each item scopes the gallery to a folder (All / … / Unfiled).
  const campaignFolderNav = (brand: string) => {
    const folders = campaignFolders[brand] ?? []
    if (!folders.length) return null
    const onThisGallery = page === 'clients' && homeFilter === `brand:${brand}`
    if (!onThisGallery) return null
    const items: [string | null, string][] = [[null, 'All'], ...folders.map((f) => [f, f] as [string, string]), ['', 'Unfiled']]
    const pick = (val: string | null) => {
      setHomeFilter(`brand:${brand}`)
      setClientFilter('all')
      setCampaignFolderView(val)
      setPage('portfolio')
    }
    return (
      <div className="nav-sub">
        {items.map(([val, label]) => (
          <button key={label} className={`nav-subitem${campaignFolderView === val ? ' active' : ''}`} onClick={() => pick(val)}>
            {label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <aside className={`sidebar home-sidebar hsb${railed ? ' hsb-rail' : ''}`}>
      <div className="hsb-top">
        <button
          className={`hsb-ws${wsOpen ? ' open' : ''}`}
          onClick={() => setWsOpen((o) => !o)}
          title="Workspace menu"
          aria-haspopup="menu"
          aria-expanded={wsOpen}
        >
          <span className="hsb-ws-chip">{WORKSPACE[0]}</span>
          <span className="hsb-ws-name">{WORKSPACE}</span>
          <span className="hsb-ws-caret">
            <Ico name="caret" />
          </span>
        </button>

        {wsOpen && (
          <>
            <div className="hsb-ws-scrim" onClick={() => setWsOpen(false)} />
            <div className="hsb-ws-menu" role="menu">
              <button
                className="hsb-ws-mi hsb-ws-mi-head"
                role="menuitemradio"
                aria-checked="true"
                onClick={() => {
                  setPage('portfolio')
                  setWsOpen(false)
                }}
              >
                <span className="hsb-ws-chip sm">{WORKSPACE[0]}</span>
                <span className="hsb-ws-mi-name">{WORKSPACE}</span>
                <span className="hsb-ws-mi-check">
                  <Ico name="check" />
                </span>
              </button>
              <button className="hsb-ws-mi" role="menuitem" onClick={() => setWsOpen(false)}>
                <span className="hsb-ws-mi-ic">
                  <Ico name="plus" />
                </span>
                New workspace
              </button>

              <div className="hsb-ws-sep" />

              <button
                className="hsb-ws-mi"
                role="menuitem"
                onClick={() => {
                  setPage('account')
                  setWsOpen(false)
                }}
              >
                <span className="hsb-ws-mi-ic">
                  <Ico name="user" />
                </span>
                Account settings
              </button>

              <div className="hsb-ws-sep" />

              <button className="hsb-ws-mi" role="menuitem" onClick={() => setWsOpen(false)}>
                <span className="hsb-ws-mi-ic">
                  <Ico name="userplus" />
                </span>
                Invite team members
              </button>
              {can(role, 'billing') && (
                <button
                  className="hsb-ws-mi"
                  role="menuitem"
                  onClick={() => {
                    setPage('billing')
                    setWsOpen(false)
                  }}
                >
                  <span className="hsb-ws-mi-ic">
                    <Ico name="billing" />
                  </span>
                  Billing
                </button>
              )}
              <button
                className="hsb-ws-mi"
                role="menuitem"
                onClick={() => {
                  setPage('connectors')
                  setWsOpen(false)
                }}
              >
                <span className="hsb-ws-mi-ic">
                  <Ico name="apps" />
                </span>
                Apps and integrations
              </button>

              <div className="hsb-ws-sep" />

              <button className="hsb-ws-mi" role="menuitem" onClick={() => setWsOpen(false)}>
                <span className="hsb-ws-mi-ic">
                  <Ico name="signout" />
                </span>
                Sign out
              </button>
            </div>
          </>
        )}
      </div>

      <div className="hsb-actions">
        <button className="hsb-qa" onClick={() => openAsk()} title="Ask Claude / quick actions">
          <span className="hsb-qa-ic">
            <Ico name="spark" />
          </span>
          <span className="hsb-qa-label">Quick actions</span>
          <span className="hsb-kbd">⌘K</span>
        </button>
        <button className="hsb-srch" onClick={() => openAsk()} title="Search / ask" aria-label="Search">
          <Ico name="search" />
        </button>
      </div>

      <nav className="sidebar-nav">
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
        <div className="hsb-chats">
          <button className="hsb-sec" onClick={() => setDataOpen((o) => !o)}>
            <span className={`hsb-sec-chev${dataOpen ? ' open' : ''}`}>
              <Ico name="caret" />
            </span>
            Data
          </button>
          {dataOpen && (
            <div className="hsb-chat-list">
              <button
                className={`nav-item${page === 'content' && libraryMode === 'catalog' ? ' active' : ''}`}
                onClick={() => setLibraryMode('catalog')}
                title="Library — every published post, video, and page a brand has shipped"
              >
                <span className="nav-ico">
                  <Ico name="library" />
                </span>
                <span className="nav-label">Library</span>
              </button>
              <button
                className={`nav-item${page === 'content' && libraryMode !== 'catalog' ? ' active' : ''}`}
                onClick={() => setLibraryMode('data')}
                title="Insights — the read over this brand's library: headline metrics, charts, and findings"
              >
                <span className="nav-ico">
                  <Ico name="insights" />
                </span>
                <span className="nav-label">Insights</span>
              </button>
              <button
                className={`nav-item${page === 'reports' ? ' active' : ''}`}
                onClick={() => setPage('reports')}
                title="Reports — saved Claude write-ups over the brand's library"
              >
                <span className="nav-ico">
                  <Ico name="reports" />
                </span>
                <span className="nav-label">Reports</span>
              </button>
            </div>
          )}
        </div>

        <button
          className={`nav-item${page === 'flows' ? ' active' : ''}`}
          onClick={() => setPage('flows')}
          title="Flows — a visual builder for campaign automations (exploratory)"
        >
          <span className="nav-ico">
            <Ico name="flows" />
          </span>
          <span className="nav-label">Flows</span>
        </button>

        {brands.length === 1 ? (
          // Campaigns live under Flows now; the single-brand workspace no longer shows a
          // separate Campaigns nav item.
          null
        ) : (
          <>
            <div className="nav-section">Campaigns</div>
            {brands.map((b) => {
              const key = `brand:${b.name}`
              return (
                <div key={b.name}>
                  <div className={`nav-item home-sb-brand${(onGallery || brandCtx) && homeFilter === key ? ' active' : ''}`}>
                    <button className="home-sb-brand-main" onClick={() => go(key)} title={`Show ${b.name}'s canvases`}>
                      <span className="nav-ico">
                        <Ico name="campaigns" />
                      </span>
                      <span className="nav-label">{b.name}</span>
                      <span className="nav-count">{b.count}</span>
                    </button>
                    <button
                      className="home-sb-del"
                      title={`Delete ${b.name}`}
                      aria-label={`Delete ${b.name}`}
                      onClick={() => setConfirmDelete(b.name)}
                    >
                      ✕
                    </button>
                  </div>
                  {campaignFolderNav(b.name)}
                </div>
              )
            })}
          </>
        )}

        <div className="hsb-chats">
          <button className="hsb-sec" onClick={() => setRecordsOpen((o) => !o)}>
            <span className={`hsb-sec-chev${recordsOpen ? ' open' : ''}`}>
              <Ico name="caret" />
            </span>
            Records
          </button>
          {recordsOpen && (
            <div className="hsb-chat-list">
              {RECORD_GROUPS.map((g) => {
                const activeInGroup = g.items.some((it) => it.page === page)
                const expanded = openGroups.has(g.label) || activeInGroup
                return (
                  <div key={g.label} className="hsb-rec-group">
                    <button
                      className={`nav-item hsb-rec-parent${activeInGroup ? ' active-in' : ''}`}
                      aria-expanded={expanded}
                      onClick={() =>
                        setOpenGroups((prev) => {
                          const next = new Set(prev)
                          next.has(g.label) ? next.delete(g.label) : next.add(g.label)
                          return next
                        })
                      }
                    >
                      <span className={`hsb-rec-chev${expanded ? ' open' : ''}`}>
                        <Ico name="caret" />
                      </span>
                      <span className="nav-label">{g.label}</span>
                    </button>
                    {expanded && (
                      <div className="hsb-rec-children">
                        {g.items.map((it) => (
                          <button
                            key={it.page}
                            className={`nav-item hsb-rec-child${page === it.page ? ' active' : ''}`}
                            onClick={() => setPage(it.page)}
                            title={it.label}
                          >
                            <span className="nav-ico">
                              <Ico name={it.ico} />
                            </span>
                            <span className="nav-label">{it.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {recentChats.length > 0 && (
          <div className="hsb-chats">
            <button className="hsb-sec" onClick={() => setChatsOpen((o) => !o)}>
              <span className={`hsb-sec-chev${chatsOpen ? ' open' : ''}`}>
                <Ico name="caret" />
              </span>
              Chats
            </button>
            {chatsOpen && (
              <div className="hsb-chat-list">
                {recentChats.map((r) => (
                  <button
                    key={r.id}
                    className="hsb-chat"
                    title={r.title}
                    onClick={() => {
                      setClientFilter(r.client)
                      setPage('reports')
                    }}
                  >
                    <span className="hsb-chat-ic">
                      <Ico name="chat" />
                    </span>
                    <span className="hsb-chat-title">{r.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="sidebar-foot">
        {role === 'owner' && (
          <button className={`nav-item${page === 'connectors' ? ' active' : ''}`} onClick={() => setPage('connectors')} title="Connect Claude">
            <span className="nav-ico">
              <Ico name="connect" />
            </span>
            <span className="nav-label">Connect Claude</span>
          </button>
        )}
        {can(role, 'billing') && (
          <button className={`nav-item${page === 'billing' ? ' active' : ''}`} onClick={() => setPage('billing')} title="Billing">
            <span className="nav-ico">
              <Ico name="billing" />
            </span>
            <span className="nav-label">Billing</span>
          </button>
        )}
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

      {confirmDelete && (
        <>
          <div className="drawer-scrim" onClick={() => setConfirmDelete(null)} />
          <div className="confirm-modal" role="dialog" aria-label="Delete brand">
            <strong className="confirm-title">Delete {confirmDelete}?</strong>
            <p className="confirm-text">This removes the brand and its canvases. This can't be undone.</p>
            <div className="confirm-foot">
              <button className="btn sm" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <span className="spacer" />
              <button
                className="btn sm danger"
                onClick={() => {
                  const name = confirmDelete
                  if (homeFilter === `brand:${name}`) setHomeFilter('all')
                  void deleteClient(name)
                  setConfirmDelete(null)
                }}
              >
                Delete brand
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
