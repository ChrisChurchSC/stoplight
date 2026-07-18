import { CHANNEL_LIST } from '../domain/channels'
import { TRIGGER_COLUMNS, TRIGGER_FIELDS, TRIGGER_STATUSES } from '../domain/trigger'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

const ICON = <path d="M13 2 4 14h7l-1 8 9-12h-7z" />

/** Records › Go-to-market › Triggers — the events and conditions that kick off outreach. */
export function TriggersView() {
  const triggers = useTrafficStore((s) => s.triggers)
  const addTrigger = useTrafficStore((s) => s.addTrigger)
  const updateTrigger = useTrafficStore((s) => s.updateTrigger)
  const deleteTrigger = useTrafficStore((s) => s.deleteTrigger)

  // Scope to the brand in the rail; untagged records show under every brand rather than vanishing.
  const { brands } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const brand = clientFilter !== 'all' ? clientFilter : brands[0]?.name ?? ''
  const scoped = triggers.filter((t) => !t.brand || t.brand === brand)
  const audienceNames = (clientAudiences[brand] ?? []).map((a) => a.name)

  return (
    <RecordsTable
      title="Triggers"
      icon={ICON}
      columns={TRIGGER_COLUMNS}
      fields={TRIGGER_FIELDS}
      statuses={TRIGGER_STATUSES}
      rows={scoped}
      noun={['trigger', 'triggers']}
      onAdd={() => addTrigger({ brand })}
      onUpdate={updateTrigger}
      onDelete={deleteTrigger}
      fieldOptions={{ channel: CHANNEL_LIST.map((c) => c.label), audience: audienceNames }}
    />
  )
}
