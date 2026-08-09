import { useState } from 'react'
import { liveRecordUsage, splitRecordsByUse } from '../domain/audienceUsage'
import { undefinedRecords } from '../domain/recordDefined'
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
  // Only the LIVING workspace holds a record in place — see liveRecordUsage for why the dead
  // (archived campaigns, boards outliving deleted campaigns) do not get a vote.
  const usage = liveRecordUsage({ rows: allRows, boards: flowBoards, smartObjects, campaigns: campaignList })
  const { unused } = splitRecordsByUse(scoped, usage, { refType: 'message', cardKind: 'message' })
  /** The ones that are only a name — the same rule the Audiences page applies. See hasDefinition. */
  const undefined_ = undefinedRecords('message', scoped)
  const [confirmUndefined, setConfirmUndefined] = useState(false)
  const runRemoveUndefined = () => {
    const live = useTrafficStore.getState().messages.filter((m) => !m.brand || m.brand === brand)
    for (const m of undefinedRecords('message', live)) deleteMessage(m.id)
    setConfirmUndefined(false)
  }
  const [confirmSweep, setConfirmSweep] = useState(false)
  const runSweep = () => {
    // Live read: the confirm sat open while the store may have moved on.
    const live = useTrafficStore.getState()
    const liveScoped = live.messages.filter((m) => !m.brand || m.brand === brand)
    const split = splitRecordsByUse(
      liveScoped,
      liveRecordUsage({ rows: live.rows, boards: live.flowBoards, smartObjects: live.smartObjects, campaigns: live.campaignList }),
      { refType: 'message', cardKind: 'message' },
    )
    for (const m of split.unused) deleteMessage(m.id)
    setConfirmSweep(false)
  }

  /**
   * STARTING FRESH IS ALLOWED. The sweep protects everything living work references, which is
   * right as a default and useless to someone who has decided the whole shelf is noise. This is
   * the other tool: delete every message on this brand's shelf, used and unused alike, after a
   * confirm that says how much live wiring gets cut. Cards and pins that pointed at a deleted
   * record keep their stored labels and offer nothing — the state the app already knows — and the
   * next generation mints fresh records for whatever it writes.
   */
  const [confirmWipe, setConfirmWipe] = useState(false)
  const usedCount = scoped.length - unused.length
  const runWipe = () => {
    const live = useTrafficStore.getState()
    for (const m of live.messages.filter((x) => !x.brand || x.brand === brand)) deleteMessage(m.id)
    setConfirmWipe(false)
  }

  return (
    <>
    {confirmUndefined && (
      <>
        <div className="drawer-scrim" onClick={() => setConfirmUndefined(false)} />
        <div className="confirm-modal" role="dialog" aria-label="Remove messages that are only a name">
          <strong className="confirm-title">
            Remove {undefined_.length} message{undefined_.length === 1 ? '' : 's'} with nothing but a name?
          </strong>
          <p className="confirm-text">
            A message has to say something beyond what it is called — the angle it argues, or an
            uploaded document — or the copy is written from a label and a picker cannot tell it from
            the one beside it. These say nothing. Some may still be referenced by live work: those
            assets keep the name and lose the record, which is the same state as deleting one by hand.
          </p>
          <p className="confirm-text" style={{ maxHeight: 180, overflowY: 'auto' }}>
            {undefined_.map((m) => m.name || 'Untitled').join(' · ')}
          </p>
          <div className="confirm-foot">
            <button className="btn sm" onClick={() => setConfirmUndefined(false)}>
              Cancel
            </button>
            <span className="spacer" />
            <button className="btn sm danger" onClick={runRemoveUndefined}>
              Remove {undefined_.length}
            </button>
          </div>
        </div>
      </>
    )}
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
    {confirmWipe && (
      <>
        <div className="drawer-scrim" onClick={() => setConfirmWipe(false)} />
        <div className="confirm-modal" role="dialog" aria-label="Delete all messages">
          <strong className="confirm-title">
            Start fresh — delete all {scoped.length} message{scoped.length === 1 ? '' : 's'}?
          </strong>
          <p className="confirm-text">
            {usedCount > 0
              ? `${usedCount} of these are still referenced by live campaigns. Their cards and pins will keep the stored name and point at nothing until you re-pick or regenerate — the next generation mints fresh records for what it writes.`
              : 'Nothing live references any of these. The next generation mints fresh records for what it writes.'}{' '}
            Removed for good.
          </p>
          <p className="confirm-text" style={{ maxHeight: 180, overflowY: 'auto' }}>
            {scoped.map((m) => m.name || 'Untitled').join(' · ')}
          </p>
          <div className="confirm-foot">
            <button className="btn sm" onClick={() => setConfirmWipe(false)}>
              Cancel
            </button>
            <span className="spacer" />
            <button className="btn sm danger" onClick={runWipe}>
              Delete all {scoped.length}
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
      headerAction={[
        // First, for the reason it is first on Audiences: a record that is only a name is a worse
        // problem than one nothing uses, and some of these are in use.
        ...(undefined_.length
          ? [{ label: `Only a name (${undefined_.length})`, run: () => setConfirmUndefined(true) }]
          : []),
        ...(unused.length ? [{ label: `Clean up unused (${unused.length})`, run: () => setConfirmSweep(true) }] : []),
        // Offered whenever the shelf holds anything: starting fresh is a decision about the whole
        // shelf, not about the unused corner of it.
        ...(scoped.length ? [{ label: 'Start fresh…', run: () => setConfirmWipe(true) }] : []),
      ]}
      onAdd={() => addMessage({ brand })}
      onUpdate={updateMessage}
      onDelete={deleteMessage}
      fieldOptions={{ audience: audienceNames }}
    />
    </>
  )
}
