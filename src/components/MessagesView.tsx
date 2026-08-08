import { useState } from 'react'
import { splitRecordsByUse } from '../domain/audienceUsage'
import { canvasBrandScope } from '../domain/brand'
import { MESSAGE_COLUMNS, MESSAGE_FIELDS, MESSAGE_STATUSES } from '../domain/message'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

const ICON = (
  <>
    <path d="M4 5h16v11H8l-4 3z" />
    <path d="M8 9h8M8 12h5" />
  </>
)

/** Records › Message › Messages — reusable messages/angles as a spreadsheet. */
export function MessagesView() {
  const messages = useTrafficStore((s) => s.messages)
  const addMessage = useTrafficStore((s) => s.addMessage)
  const updateMessage = useTrafficStore((s) => s.updateMessage)
  const deleteMessage = useTrafficStore((s) => s.deleteMessage)

  // Scope to the brand in the rail; untagged records show under every brand rather than vanishing.
  const { brands } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  // Scoped by canvasBrandScope, not by "whichever brand is first": with several in the account and
  // none selected, guessing one showed that brand's records here and filed anything added under it.
  const brand = canvasBrandScope(clientFilter, brands.map((b) => b.name))
  const scoped = messages.filter((m) => !m.brand || m.brand === brand)
  // The Audience column picks from the brand's audiences.
  const audienceNames = (clientAudiences[brand] ?? []).map((a) => a.name)

  /**
   * The same sweep the Audiences page has, for the same reason: generation mints message records
   * (the builder names one per campaign), and a shelf that only ever grows becomes a picker of
   * strangers. splitRecordsByUse is the shared boundary — one meaning of "unused" across every
   * record page — checked against asset pins, boards, smart objects and campaign pins, archived
   * included. See SegmentsView for the long version.
   */
  const allRows = useTrafficStore((s) => s.rows)
  const flowBoards = useTrafficStore((s) => s.flowBoards)
  const smartObjects = useTrafficStore((s) => s.smartObjects)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const usage = { rows: allRows, boards: flowBoards, smartObjects, campaigns: campaignList }
  const { unused } = splitRecordsByUse(scoped, usage, { refType: 'message', cardKind: 'message' })
  const [confirmSweep, setConfirmSweep] = useState(false)
  const runSweep = () => {
    // Live read: the confirm sat open while the store may have moved on.
    const live = useTrafficStore.getState()
    const liveScoped = live.messages.filter((m) => !m.brand || m.brand === brand)
    const split = splitRecordsByUse(
      liveScoped,
      { rows: live.rows, boards: live.flowBoards, smartObjects: live.smartObjects, campaigns: live.campaignList },
      { refType: 'message', cardKind: 'message' },
    )
    for (const m of split.unused) deleteMessage(m.id)
    setConfirmSweep(false)
  }

  return (
    <>
    {confirmSweep && (
      <>
        <div className="drawer-scrim" onClick={() => setConfirmSweep(false)} />
        <div className="confirm-modal" role="dialog" aria-label="Remove unused messages">
          <strong className="confirm-title">
            Remove {unused.length} unused message{unused.length === 1 ? '' : 's'}?
          </strong>
          <p className="confirm-text">
            None of these are referenced by any asset, board, smart object or campaign. Everything
            your work points at stays. Removed for good.
          </p>
          {/* The names ARE the decision, so they are on the dialog rather than behind it. */}
          <p className="confirm-text" style={{ maxHeight: 180, overflowY: 'auto' }}>
            {unused.map((m) => m.name || 'Untitled').join(' · ')}
          </p>
          <div className="confirm-foot">
            <button className="btn sm" onClick={() => setConfirmSweep(false)}>
              Cancel
            </button>
            <span className="spacer" />
            <button className="btn sm danger" onClick={runSweep}>
              Remove {unused.length}
            </button>
          </div>
        </div>
      </>
    )}
    <RecordsTable
      title="Messages"
      term="message"
      icon={ICON}
      columns={MESSAGE_COLUMNS}
      fields={MESSAGE_FIELDS}
      statuses={MESSAGE_STATUSES}
      rows={scoped}
      noun={['message', 'messages']}
      headerAction={unused.length ? [{ label: `Clean up unused (${unused.length})`, run: () => setConfirmSweep(true) }] : undefined}
      onAdd={() => addMessage({ brand })}
      onUpdate={updateMessage}
      onDelete={deleteMessage}
      fieldOptions={{ audience: audienceNames }}
    />
    </>
  )
}
