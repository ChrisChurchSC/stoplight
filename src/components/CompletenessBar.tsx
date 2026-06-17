import { CHANNELS } from '../domain/channels'
import { typesFor } from '../domain/channelAssetTypes'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

/**
 * When a single channel is selected, show its asset-type set and which types
 * are present in the sheet — the creative-completeness check.
 */
export function CompletenessBar() {
  const filter = useTrafficStore((s) => s.filter)
  const rows = useTrafficStore((s) => s.rows)
  const addMissingSlots = useTrafficStore((s) => s.addMissingSlots)

  if (filter === 'all') return null

  // Required set excludes the Other/custom escape hatch.
  const types = typesFor(filter).filter((x) => x.value !== 'other')
  const present = new Set(rows.filter((r) => r.channel === filter).map((r) => r.assetType))
  const filled = types.filter((x) => present.has(x.value)).length
  const missing = types.length - filled

  return (
    <div className="completeness">
      <div className="completeness-head">
        <ChannelIcon channel={filter} size={15} />
        <strong>{CHANNELS[filter].label}</strong>
        <span className="completeness-count">
          {filled}/{types.length} asset types
        </span>
        {missing > 0 && (
          <button className="btn sm" onClick={() => addMissingSlots(filter)}>
            + Add {missing} missing
          </button>
        )}
      </div>
      <div className="slot-chips">
        {types.map((x) => {
          const has = present.has(x.value)
          return (
            <span key={x.value} className={`slot-chip${has ? ' has' : ''}`}>
              <span className="slot-mark">{has ? '✓' : '○'}</span>
              {x.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
