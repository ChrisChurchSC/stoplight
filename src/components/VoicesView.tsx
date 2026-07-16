import { VOICE_COLUMNS, VOICE_FIELDS, VOICE_STATUSES } from '../domain/voice'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

// A speech bubble with a sound wave — the brand's voice.
const ICON = (
  <>
    <path d="M4 5h16v11H8l-4 3z" />
    <path d="M9 10v2M12 8.5v5M15 10v2" />
  </>
)

/** Records › Foundation › Voices — brand voice / tone-of-voice profiles as a spreadsheet. */
export function VoicesView() {
  const voices = useTrafficStore((s) => s.voices)
  const addVoice = useTrafficStore((s) => s.addVoice)
  const updateVoice = useTrafficStore((s) => s.updateVoice)
  const deleteVoice = useTrafficStore((s) => s.deleteVoice)

  // Scope to the brand in the rail; untagged records show under every brand rather than vanishing.
  const { brands } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const brand = clientFilter !== 'all' ? clientFilter : brands[0]?.name ?? ''
  const scoped = voices.filter((v) => !v.brand || v.brand === brand)

  return (
    <RecordsTable
      title="Voices"
      icon={ICON}
      columns={VOICE_COLUMNS}
      fields={VOICE_FIELDS}
      statuses={VOICE_STATUSES}
      rows={scoped}
      noun={['voice', 'voices']}
      onAdd={() => addVoice({ brand })}
      onUpdate={updateVoice}
      onDelete={deleteVoice}
    />
  )
}
