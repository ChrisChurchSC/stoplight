import { CHANNELS } from '../domain/channels'
import { slotsFor } from '../domain/channelAssets'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

/**
 * When a single channel is selected in the sidebar, show its required asset set
 * and which slots are present in the sheet — the creative-completeness check.
 */
export function CompletenessBar() {
  const filter = useTrafficStore((s) => s.filter)
  const rows = useTrafficStore((s) => s.rows)
  const addMissingSlots = useTrafficStore((s) => s.addMissingSlots)

  if (filter === 'all') return null

  const slots = slotsFor(filter)
  const present = new Set(rows.filter((r) => r.channel === filter).map((r) => r.format))
  const filled = slots.filter((s) => present.has(s.key)).length
  const missing = slots.length - filled

  return (
    <div className="completeness">
      <div className="completeness-head">
        <ChannelIcon channel={filter} size={15} />
        <strong>{CHANNELS[filter].label}</strong>
        <span className="completeness-count">
          {filled}/{slots.length} asset types
        </span>
        {missing > 0 && (
          <button className="btn sm" onClick={() => addMissingSlots(filter)}>
            + Add {missing} missing
          </button>
        )}
      </div>
      <div className="slot-chips">
        {slots.map((s) => {
          const has = present.has(s.key)
          return (
            <span key={s.key} className={`slot-chip${has ? ' has' : ''}`} title={s.kind === 'media' ? s.ratio : s.charLimit ? `${s.charLimit} chars` : 'text'}>
              <span className="slot-mark">{has ? '✓' : '○'}</span>
              {s.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
