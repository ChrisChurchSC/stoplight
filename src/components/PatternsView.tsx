import { CHANNEL_LIST } from '../domain/channels'
import { PATTERN_COLUMNS, PATTERN_FIELDS, PATTERN_STATUSES } from '../domain/pattern'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

const ICON = (
  <>
    <path d="M4 7h16M4 12h16M4 17h10" />
    <circle cx="18.5" cy="17" r="2" />
  </>
)

/** Records › Foundation › Patterns — reusable messaging patterns, hooks, formats, and trends. */
export function PatternsView() {
  const patterns = useTrafficStore((s) => s.patterns)
  const addPattern = useTrafficStore((s) => s.addPattern)
  const updatePattern = useTrafficStore((s) => s.updatePattern)
  const deletePattern = useTrafficStore((s) => s.deletePattern)

  // Scope to the brand in the rail; untagged records show under every brand rather than vanishing.
  const { brands } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const brand = clientFilter !== 'all' ? clientFilter : brands[0]?.name ?? ''
  const scoped = patterns.filter((p) => !p.brand || p.brand === brand)

  return (
    <RecordsTable
      title="Patterns"
      icon={ICON}
      columns={PATTERN_COLUMNS}
      fields={PATTERN_FIELDS}
      statuses={PATTERN_STATUSES}
      rows={scoped}
      noun={['pattern', 'patterns']}
      onAdd={() => addPattern({ brand })}
      onUpdate={updatePattern}
      onDelete={deletePattern}
      fieldOptions={{ channel: CHANNEL_LIST.map((c) => c.label) }}
    />
  )
}
