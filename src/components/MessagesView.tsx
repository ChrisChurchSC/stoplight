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
  const brand = clientFilter !== 'all' ? clientFilter : brands[0]?.name ?? ''
  const scoped = messages.filter((m) => !m.brand || m.brand === brand)
  // The Audience column picks from the brand's audiences.
  const audienceNames = (clientAudiences[brand] ?? []).map((a) => a.name)

  return (
    <RecordsTable
      title="Messages"
      icon={ICON}
      columns={MESSAGE_COLUMNS}
      fields={MESSAGE_FIELDS}
      statuses={MESSAGE_STATUSES}
      rows={scoped}
      noun={['message', 'messages']}
      onAdd={() => addMessage({ brand })}
      onUpdate={updateMessage}
      onDelete={deleteMessage}
      fieldOptions={{ audience: audienceNames }}
    />
  )
}
