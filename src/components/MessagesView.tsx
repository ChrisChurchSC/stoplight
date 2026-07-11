import { MESSAGE_COLUMNS, MESSAGE_FIELDS, MESSAGE_STATUSES } from '../domain/message'
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

  return (
    <RecordsTable
      title="Messages"
      icon={ICON}
      columns={MESSAGE_COLUMNS}
      fields={MESSAGE_FIELDS}
      statuses={MESSAGE_STATUSES}
      rows={messages}
      noun={['message', 'messages']}
      onAdd={() => addMessage()}
      onUpdate={updateMessage}
      onDelete={deleteMessage}
    />
  )
}
