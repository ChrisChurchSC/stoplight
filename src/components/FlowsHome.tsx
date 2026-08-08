import { useRef, useState, type DragEvent, type ReactElement } from 'react'
import { CHANNELS } from '../domain/channels'
import { campaignInIndexScope } from '../domain/brand'
import { campaignShortName, clientForCampaign } from '../domain/clients'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { deriveCampaignStatus, type CampaignStatus } from '../domain/lifecycle'
import type { ChannelId } from '../domain/types'
import {
  DRAFTS,
  MAX_FOLDER_DEPTH,
  buildFolderTree,
  canNestUnder,
  countDeep,
  folderName,
  withAncestors,
  type FolderNode,
} from '../domain/campaignFolders'
import { useTrafficStore } from '../store/useTrafficStore'
import { Hint } from './Hint'
import { ChannelIcon } from './ChannelIcon'
import { InfoTip } from './InfoTip'

/**
 * The campaigns landing page: every one of a brand's campaigns shown as a card, organized into
 * FOLDERS (the shared campaign-folder system, so a campaign's folder is the same whether seen here
 * or in Campaigns). Create folders, nest them up to MAX_FOLDER_DEPTH deep, file campaigns into them
 * by dragging, and click a card to open it in the canvas.
 *
 * TWO THINGS ONLY: campaigns and folders. This view used to also own the flight level — a "＋
 * Flight" on every card, and a campaign with more than one run drilling in like a directory. That
 * meant the only way to get a folder was to schedule a second run of something, and it put "when
 * does this run" in the same control as "how do I organize fifty of these". Folders are now real and
 * nestable, and the flight level is gone from here.
 */
interface FlowCard {
  name: string
  status: CampaignStatus
  assetCount: number
  types: number
  channels: ChannelId[]
  folder?: string
  /** Umbrella parent campaign name, when this is an audience-specific child. */
  parent?: string
  /** The single audience this campaign is personalized to (its segment reference label). */
  personalizedTo?: string
  /** A manually-created umbrella container (renders as an umbrella even with no children yet). */
  isUmbrella?: boolean
}

const STATUS_RANK: Record<CampaignStatus, number> = { active: 0, 'in-review': 1, planning: 2, completed: 3 }

export function FlowsHome({ brand, onOpen, onNew }: { brand: string; onOpen: (name: string) => void; onNew: () => void }) {
  const rows = useTrafficStore((s) => s.rows)
  /**
   * Whether `rows` is the whole workspace yet. Every "you have nothing" surface on this page is
   * derived from rows, and on a network-backed workspace rows arrive after the first paint — so
   * without this the page opens by announcing "0 campaigns" and offering "Start a campaign" to
   * someone who has fifty, then swaps the cards and their channels in underneath them.
   */
  const rowsHydrated = useTrafficStore((s) => s.rowsHydrated)
  /**
   * The campaign RECORDS load separately from the rows (hydrateRecords vs. the rows refresh), and
   * a card can be minted from either — so the card list is only "your campaigns" once both have
   * landed. Rows alone was enough for the tallies; a list of stale records is still a list of
   * ghosts however fresh the rows beside it are.
   */
  const recordsHydrated = useTrafficStore((s) => s.boardsHydrated)
  const listReady = rowsHydrated && recordsHydrated
  /**
   * Whether a brand has been CHOSEN, read straight from the workspace filter rather than inferred
   * from `brand` — which canvasBrandScope may have resolved on its own for a single-brand workspace.
   * That inference is right for a picker and wrong for an index. See campaignInIndexScope.
   */
  const brandChosen = useTrafficStore((s) => s.clientFilter !== 'all')
  const campaignList = useTrafficStore((s) => s.campaignList)
  const campaignFolders = useTrafficStore((s) => s.campaignFolders)
  const createCampaignFolder = useTrafficStore((s) => s.createCampaignFolder)
  const setCampaignFolder = useTrafficStore((s) => s.setCampaignFolder)
  const deleteCampaignFolder = useTrafficStore((s) => s.deleteCampaignFolder)
  const renameCampaignFolder = useTrafficStore((s) => s.renameCampaignFolder)
  const deleteCampaign = useTrafficStore((s) => s.deleteCampaign)
  const renameCampaign = useTrafficStore((s) => s.renameCampaign)
  const setNewCampaignParent = useTrafficStore((s) => s.setNewCampaignParent)
  // Which folder a new-folder input is open under. '' = a new top-level folder, null = closed.
  const [newFolderUnder, setNewFolderUnder] = useState<string | null>(null)
  const [newFolder, setNewFolder] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  // A folder pending deletion: its path, plus how many campaigns and subfolders go with it.
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<{ path: string; campaigns: number; subfolders: number } | null>(null)
  // Collapsed folders, by path. Default expanded. Kept separate from the umbrella `collapsed` set
  // because a folder path and a campaign name share no namespace and could collide.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const toggleFolder = (path: string) =>
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  // Inline rename in progress. kind distinguishes a campaign/umbrella (key = full campaign name)
  // from a folder (key = folder path). value holds the editable text: for a campaign the short name,
  // for a folder its last segment.
  const [renaming, setRenaming] = useState<{ kind: 'campaign' | 'folder'; key: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Escape cancels a rename; guards against the input's onBlur firing a stray commit right after.
  const renameSkipRef = useRef(false)
  /**
   * The brand prefix, ONLY when there is a brand. Campaign names are stored brand-prefixed
   * ("World Within — Holiday Campaign"), and this used to be built unconditionally — so with no
   * brand chosen it became the bare separator " — ", and stripping that from a name gave
   * "World WithinHoliday Campaign". Reading a name is not worth a guess: no brand, no prefix.
   */
  const brandPrefix = brand ? `${brand} — ` : ''
  const startRename = (kind: 'campaign' | 'folder', key: string, current: string) => {
    renameSkipRef.current = false
    setRenaming({ kind, key })
    setRenameValue(current)
  }
  const commitRename = () => {
    if (renameSkipRef.current) {
      renameSkipRef.current = false
      setRenaming(null)
      setRenameValue('')
      return
    }
    if (!renaming) return
    const v = renameValue.trim()
    if (v) {
      if (renaming.kind === 'folder') {
        renameCampaignFolder(brand, renaming.key, v)
      } else {
        const nextFull = brandPrefix && renaming.key.startsWith(brandPrefix) ? brandPrefix + v : v
        void renameCampaign(renaming.key, nextFull)
      }
    }
    setRenaming(null)
    setRenameValue('')
  }
  const cancelRename = () => {
    renameSkipRef.current = true
    setRenaming(null)
    setRenameValue('')
  }
  // Shared inline rename input for cards, umbrella heads and folder heads.
  const renameInput = (placeholder: string) => (
    <input
      className="flow-home-rename-input"
      autoFocus
      placeholder={placeholder}
      value={renameValue}
      onChange={(e) => setRenameValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commitRename}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commitRename()
        if (e.key === 'Escape') cancelRename()
      }}
    />
  )
  // Open the campaign builder to create a campaign nested under an umbrella.
  const addCampaignUnder = (umbrella: string) => {
    setNewCampaignParent(umbrella)
    onNew()
  }
  // Drag a flow card onto a folder section to file it there (replaces the folder dropdown).
  const [dragName, setDragName] = useState<string | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
  // Umbrellas that are collapsed (children hidden). Default expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleUmbrella = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  // A folder (or the unfiled section) as a drop target. `folder` is a full path, so dropping onto a
  // nested folder files the campaign at that depth.
  const sectionDrop = (folder: string | undefined) => {
    const key = folder ?? '__unfiled__'
    return {
      active: dropKey === key,
      // stopPropagation on both, because folder sections now NEST: without it a drop on a
      // subfolder would bubble to its parent, whose handler would immediately refile the campaign
      // one level shallower, and the highlight would land on the parent rather than the folder
      // under the cursor.
      onDragOver: (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        if (dropKey !== key) setDropKey(key)
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const n = e.dataTransfer.getData('text/plain')
        if (n) setCampaignFolder(n, folder)
        setDropKey(null)
        setDragName(null)
      },
    }
  }

  const folders = campaignFolders[brand] ?? []
  /**
   * EVERY CAMPAIGN UNTIL YOU PICK A BRAND; after that, this brand's plus the brandless ones, which
   * land in the DRAFTS bucket below. See campaignInIndexScope.
   *
   * Resolving a brand and having one CHOSEN are different things, and this page kept confusing them.
   * clientFilter resets to 'all' on every load, so after a refresh nothing has been chosen — and a
   * single-brand workspace still resolved to its one brand, while a multi-brand one resolved to ''.
   * Filtering by either emptied the page: campaigns filed under any other client, or under nobody,
   * were simply not shown. Opening a campaign set the filter to its own client, so on the way back
   * they reappeared, and the next refresh took them away again.
   *
   * Another brand's campaigns are still never in scope ONCE A BRAND IS CHOSEN, which is the leak
   * that matters. With none chosen this is a workspace index, and an index that hides most of the
   * workspace is the bug it was reporting.
   */
  const brandRows = rows.filter((r) => !r.archivedAt && campaignInIndexScope(clientForCampaign(r.campaign), brand, brandChosen))
  const forBrand = campaignList.filter((c) => !c.archivedAt && campaignInIndexScope(c.client, brand, brandChosen))
  const meta = new Map(forBrand.map((c) => [c.name, c] as const))
  const names = [
    ...new Set([
      ...brandRows.map((r) => (r.campaign ?? '').trim()).filter(Boolean),
      ...forBrand.map((c) => c.name),
    ]),
    // The content library archive ("Published content") isn't a flow — it's where every
    // ingested/published asset lives, so keep it out of the Flows list (delete it here
    // would archive the whole library). It stays reachable under Library.
  ].filter((n) => n !== CONTENT_LIBRARY_CAMPAIGN)
  const cards: FlowCard[] = names.map((name) => {
    const cRows = brandRows.filter((r) => (r.campaign ?? '').trim() === name)
    return {
      name,
      status: deriveCampaignStatus(meta.get(name), cRows),
      assetCount: cRows.length,
      types: new Set(cRows.map((r) => `${r.channel}/${r.assetType}`)).size,
      channels: [...new Set(cRows.map((r) => r.channel))] as ChannelId[],
      folder: meta.get(name)?.folder,
      parent: meta.get(name)?.parent,
      personalizedTo: meta.get(name)?.references?.find((r) => r.type === 'segment')?.label,
      isUmbrella: meta.get(name)?.isUmbrella,
    }
  })
  const sortCards = (arr: FlowCard[]) =>
    [...arr].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.assetCount - a.assetCount)
  // Umbrella grouping: children (audience-specific campaigns) nest under their parent; a child whose
  // parent no longer exists falls back to top level. Folder grouping operates on top-level cards only.
  const childrenByParent = new Map<string, FlowCard[]>()
  for (const c of cards)
    if (c.parent && meta.has(c.parent)) {
      const arr = childrenByParent.get(c.parent) ?? []
      arr.push(c)
      childrenByParent.set(c.parent, arr)
    }
  const topCards = cards.filter((c) => !(c.parent && meta.has(c.parent)))
  // Ancestors count as known folders even if only a leaf path was ever registered, so a campaign
  // filed deep does not read as unfiled while its folder renders above it.
  const knownFolders = new Set(withAncestors(folders))
  const unfiled = sortCards(topCards.filter((c) => !c.folder || !knownFolders.has(c.folder)))
  const folderTree = buildFolderTree(folders, sortCards(topCards), (c) => c.folder)


  const addFolder = () => {
    // newFolderUnder is the parent path; '' means top level. null can't reach here.
    if (newFolder.trim() && newFolderUnder !== null) createCampaignFolder(brand, newFolder, newFolderUnder)
    setNewFolder('')
    setNewFolderUnder(null)
  }
  // The new-folder input, shared by the header (top level) and each folder head (a subfolder).
  const newFolderInput = (
    <input
      className="flow-home-folder-input"
      autoFocus
      placeholder="Folder name"
      value={newFolder}
      onChange={(e) => setNewFolder(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={addFolder}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') addFolder()
        if (e.key === 'Escape') {
          setNewFolder('')
          setNewFolderUnder(null)
        }
      }}
    />
  )

  const renderCard = (c: FlowCard) => {
    const isRenaming = renaming?.kind === 'campaign' && renaming.key === c.name
    const short = campaignShortName(c.name, brand)
    return (
      <div
        key={c.name}
        className={`flow-home-card${dragName === c.name ? ' dragging' : ''}`}
        draggable={!isRenaming}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', c.name)
          e.dataTransfer.effectAllowed = 'move'
          setDragName(c.name)
        }}
        onDragEnd={() => {
          setDragName(null)
          setDropKey(null)
        }}
      >
        {!isRenaming && (
          <div className="flow-home-card-actions">
            <button className="flow-home-rename" title="Rename" aria-label="Rename" onClick={() => startRename('campaign', c.name, short)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
            <button className="flow-home-del" title="Delete campaign" aria-label="Delete campaign" onClick={() => setConfirmDelete(c.name)}>
              ✕
            </button>
          </div>
        )}
        {isRenaming ? (
          <div className="flow-home-card-open flow-home-card-renaming">{renameInput('Campaign name')}</div>
        ) : (
        <button className="flow-home-card-open" onClick={() => onOpen(c.name)}>
          <div className="flow-home-card-name">
            <span className={`flow-home-dot s-${c.status}`} aria-hidden="true" />
            <span className="flow-home-card-title-text">{campaignShortName(c.name, brand)}</span>
            {c.personalizedTo && (
              <span className="flow-home-persona" title={`Personalized to ${c.personalizedTo}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.2" />
                  <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
                </svg>
                <span>{c.personalizedTo}</span>
              </span>
            )}
          </div>
          <div className="flow-home-card-meta">
            {c.types} channel{c.types === 1 ? '' : 's'} · {c.assetCount} asset{c.assetCount === 1 ? '' : 's'}
          </div>
          <div className="flow-home-chans">
            {c.channels.slice(0, 8).map((ch) => (
              <span key={ch} className="flow-home-chan-ico" title={CHANNELS[ch]?.label ?? ch}>
                <ChannelIcon channel={ch} size={16} />
              </span>
            ))}
            {c.channels.length > 8 && <span className="flow-home-chan more">+{c.channels.length - 8}</span>}
          </div>
        </button>
        )}
      </div>
    )
  }

  // A top-level entry: an umbrella (its audience-specific children nested + collapsible) or a
  // standalone campaign.
  const renderTop = (c: FlowCard) => {
    const kids = childrenByParent.get(c.name) ?? []
    // An umbrella if it has children OR was explicitly created as one (renders even when empty).
    if (!kids.length && !c.isUmbrella) return renderCard(c)
    const isCollapsed = collapsed.has(c.name)
    const totalAssets = kids.reduce((n, k) => n + k.assetCount, 0)
    const chans = [...new Set(kids.flatMap((k) => k.channels))]
    const isRenaming = renaming?.kind === 'campaign' && renaming.key === c.name
    const short = campaignShortName(c.name, brand)
    return (
      <div key={c.name} className="flow-home-umbrella">
        <div className="flow-home-umb-head">
          <button className="flow-home-umb-toggle" onClick={() => toggleUmbrella(c.name)} aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
            {isCollapsed ? '▸' : '▾'}
          </button>
          {isRenaming ? (
            <div className="flow-home-umb-open flow-home-umb-renaming">{renameInput('Umbrella name')}</div>
          ) : (
            <button className="flow-home-umb-open" onClick={() => onOpen(c.name)}>
              <span className={`flow-home-dot s-${c.status}`} aria-hidden="true" />
              <span className="flow-home-umb-name">{short}</span>
              <span className="flow-home-umb-meta">
                {kids.length} campaign{kids.length === 1 ? '' : 's'} · {totalAssets} asset{totalAssets === 1 ? '' : 's'}
              </span>
              <span className="flow-home-chans">
                {chans.slice(0, 8).map((ch) => (
                  <span key={ch} className="flow-home-chan-ico" title={CHANNELS[ch]?.label ?? ch}>
                    <ChannelIcon channel={ch} size={15} />
                  </span>
                ))}
              </span>
            </button>
          )}
          {!isRenaming && (
            <>
              <button className="flow-home-rename" title="Rename umbrella" aria-label="Rename umbrella" onClick={() => startRename('campaign', c.name, short)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
              <button className="flow-home-del" title="Delete umbrella" aria-label="Delete umbrella" onClick={() => setConfirmDelete(c.name)}>
                ✕
              </button>
            </>
          )}
        </div>
        {!isCollapsed && (
          <div className="flow-home-grid nested">
            {sortCards(kids).map(renderCard)}
            <button className="flow-home-add-under" onClick={() => addCampaignUnder(c.name)}>
              ＋ Add a campaign
            </button>
          </div>
        )}
      </div>
    )
  }

  /**
   * One folder and everything under it. Recursive, so the depth of the markup is the depth of the
   * tree; the cap lives on the "＋ Subfolder" button, which is simply absent at MAX_FOLDER_DEPTH.
   */
  const renderFolder = (node: FolderNode<FlowCard>): ReactElement => {
    const drop = sectionDrop(node.path)
    const isCollapsed = collapsedFolders.has(node.path)
    const isRenaming = renaming?.kind === 'folder' && renaming.key === node.path
    // The count is deep, so collapsing a parent doesn't make its campaigns look like they vanished.
    const total = countDeep(node)
    const empty = !node.items.length && !node.children.length
    return (
      <section
        key={node.path}
        className={`flow-home-group${drop.active ? ' drop-active' : ''}${node.depth > 1 ? ' flow-home-group-sub' : ''}`}
        data-depth={node.depth}
        onDragOver={drop.onDragOver}
        onDrop={drop.onDrop}
      >
        <div className="flow-home-group-h">
          <button
            className="flow-home-folder-toggle"
            onClick={() => toggleFolder(node.path)}
            aria-label={isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
          <span className="flow-home-folder-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </span>
          {isRenaming ? (
            renameInput('Folder name')
          ) : (
            <>
              <span className="flow-home-folder-name">{node.name}</span>
              <span className="flow-home-group-n">{total}</span>
              {canNestUnder(node.path) ? (
                <button
                  className="flow-home-folder-sub"
                  title="New folder inside this one"
                  onClick={() => { setNewFolder(''); setNewFolderUnder(node.path) }}
                >
                  ＋ Subfolder
                </button>
              ) : (
                // Say why there's no ＋ Subfolder here, rather than leaving a hole where one sits
                // on every other folder.
                <span className="flow-home-folder-max" title={`Folders nest ${MAX_FOLDER_DEPTH} levels deep`}>
                  Deepest level
                </span>
              )}
              <button
                className="flow-home-rename"
                title="Rename folder"
                aria-label={`Rename ${node.name}`}
                onClick={() => startRename('folder', node.path, node.name)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
              <button
                className="flow-home-folder-del"
                title={
                  node.children.length
                    ? 'Delete this folder and its subfolders (campaigns become unfiled)'
                    : 'Delete folder (its campaigns become unfiled)'
                }
                aria-label={`Delete ${node.name}`}
                onClick={() => {
                  // Deleting an empty leaf is not worth a modal; anything holding campaigns or
                  // subfolders is, because it takes the subfolders with it.
                  if (empty) deleteCampaignFolder(brand, node.path)
                  else setConfirmDeleteFolder({ path: node.path, campaigns: total, subfolders: node.children.length })
                }}
              >
                ✕
              </button>
            </>
          )}
        </div>
        {!isCollapsed && (
          <>
            {newFolderUnder === node.path && <div className="flow-home-folder-new-row">{newFolderInput}</div>}
            {empty ? (
              <div className="flow-home-empty-folder">Empty. Drag a campaign here to file it.</div>
            ) : (
              node.items.length > 0 && <div className="flow-home-grid">{node.items.map(renderTop)}</div>
            )}
            {node.children.length > 0 && <div className="flow-home-subfolders">{node.children.map(renderFolder)}</div>}
          </>
        )}
      </section>
    )
  }


  return (
    <div className="flow-home">
      <header className="flow-home-head">
        <div>
          <h1 className="flow-home-title">
            Campaigns
            <InfoTip term="campaign" />
          </h1>
          {/* Campaigns only. The folder count used to sit here too, and it counted the STORED
              folder list — every implied ancestor, and every folder left behind by a campaign that
              was archived or deleted. So it read a number the page didn't show and nobody could
              account for. The folders are on screen; they don't need a tally. */}
          {/* A count is only worth showing once it's true. Until the rows land it would read
              "0 campaigns", so the line holds its space and says nothing instead of saying
              something wrong. */}
          <p className="flow-home-sub">
            {rowsHydrated ? `${cards.length} campaign${cards.length === 1 ? '' : 's'}` : ' '}
          </p>
        </div>
        <div className="flow-home-actions">
          {newFolderUnder === '' ? (
            newFolderInput
          ) : (
            <button className="flow-home-folder-new" onClick={() => { setNewFolder(''); setNewFolderUnder('') }}>
              ＋ New folder
            </button>
          )}
          {/* Positioned against this wrapper rather than measured from the viewport, so the hint
              stays under the button through resize, zoom and the rail opening. */}
          <div className="flow-home-new-wrap">
            <button
              className="flow-home-new"
              onClick={() => {
                setNewCampaignParent(null)
                onNew()
              }}
            >
              ＋ New campaign
            </button>
            <Hint
              show={rowsHydrated && cards.length === 0}
              storageKey="stoplight.hint.newCampaign.v1"
              title="Start a campaign"
              body={[
                'A campaign opens a canvas. It is where you plan, shape and ship the work, and it is built from cards.',
                'Start with a Brand card, connect it through the cards that shape the message, then connect that to the brief and pick what you are shipping. What you connect is what the writing reads from.',
              ]}
              cta={{
                label: 'New campaign',
                onClick: () => {
                  setNewCampaignParent(null)
                  onNew()
                },
              }}
            />
          </div>
        </div>
      </header>

      {/**
        * THE CARDS THEMSELVES WAIT TOO, not only the tallies. The counts and empty-states below
        * already hold their tongue until the workspace is known, but the campaign cards rendered
        * from whatever the store held at first paint — on a synced workspace, this device's stale
        * localStorage copy. A refresh flashed every campaign this browser had EVER seen, old ones
        * included, then swapped in the real list underneath — which reads as deleted work coming
        * back, not as loading. Same claim, same rule: a list of your campaigns waits until it is
        * a list of your campaigns.
        */}
      <div className="flow-home-groups">
        {listReady && folderTree.map(renderFolder)}

        {listReady && (() => {
          const drop = sectionDrop(undefined)
          return (
            <section className={`flow-home-group${drop.active ? ' drop-active' : ''}`} onDragOver={drop.onDragOver} onDrop={drop.onDrop}>
              {/* ALWAYS DRAFTS. This bucket used to rename itself to "All campaigns" whenever the
                  brand happened to have no folders, which made the one heading on the page mean two
                  different things depending on a condition nobody can see: in one workspace Drafts
                  was the unfiled corner of a filed system, in another it was everything you own.
                  It also disagreed with the tab strip and the gallery, which have always called an
                  unfiled thing Drafts unconditionally — and with the constant itself, whose whole
                  job is to be the one name this bucket answers to everywhere it is shown.

                  Drafts is also the truer word. Work starts here and gets filed later, so an empty
                  folder list means everything is still a draft, not that the bucket has stopped
                  being one. */}
              <div className="flow-home-group-h">
                {DRAFTS}
                {/* Same rule as the campaign count above: a tally waits until it is true, rather
                    than reading 0 and then correcting itself once the rows arrive. */}
                <span className="flow-home-group-n">{rowsHydrated ? unfiled.length : ''}</span>
              </div>
              {unfiled.length === 0 ? (
                // "No campaigns here yet" is a claim about the workspace, so it waits until the
                // workspace is known. Before that the bucket is simply quiet.
                rowsHydrated ? <div className="flow-home-empty-folder">No campaigns here yet.</div> : null
              ) : (
                <div className="flow-home-grid">{unfiled.map(renderTop)}</div>
              )}
            </section>
          )
        })()}
      </div>

      {confirmDelete && (
        <>
          <div className="drawer-scrim" onClick={() => setConfirmDelete(null)} />
          <div className="confirm-modal" role="dialog" aria-label="Delete campaign">
            <strong className="confirm-title">Delete {campaignShortName(confirmDelete, brand)}?</strong>
            <p className="confirm-text">This archives the campaign and all its assets. It won't show here anymore.</p>
            <div className="confirm-foot">
              <button className="btn sm" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <span className="spacer" />
              <button
                className="btn sm danger"
                onClick={() => {
                  void deleteCampaign(confirmDelete)
                  setConfirmDelete(null)
                }}
              >
                Delete campaign
              </button>
            </div>
          </div>
        </>
      )}

      {confirmDeleteFolder && (
        <>
          <div className="drawer-scrim" onClick={() => setConfirmDeleteFolder(null)} />
          <div className="confirm-modal" role="dialog" aria-label="Delete folder">
            <strong className="confirm-title">Delete {folderName(confirmDeleteFolder.path)}?</strong>
            <p className="confirm-text">
              {confirmDeleteFolder.subfolders > 0 && (
                <>
                  This also deletes the {confirmDeleteFolder.subfolders} folder
                  {confirmDeleteFolder.subfolders === 1 ? '' : 's'} inside it.{' '}
                </>
              )}
              {confirmDeleteFolder.campaigns > 0
                ? `The ${confirmDeleteFolder.campaigns} campaign${confirmDeleteFolder.campaigns === 1 ? '' : 's'} inside become unfiled. No campaign is deleted.`
                : 'No campaigns are affected.'}
            </p>
            <div className="confirm-foot">
              <button className="btn sm" onClick={() => setConfirmDeleteFolder(null)}>
                Cancel
              </button>
              <span className="spacer" />
              <button
                className="btn sm danger"
                onClick={() => {
                  deleteCampaignFolder(brand, confirmDeleteFolder.path)
                  setConfirmDeleteFolder(null)
                }}
              >
                Delete folder
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
