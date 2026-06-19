import { CHANNELS, KIND_ORDER, channelsByKind } from '../domain/channels'
import { TRACKING_KIND_LABEL, channelTracking } from '../domain/tracking'
import type { ChannelId } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

/** Tracking-setup detail drawer, opened from a channel's readiness dot in the
 *  sidebar. Shows the full infrastructure stack a channel needs + what's set up;
 *  the 'all' view is a roster you can drill into. */
export function TrackingDrawer() {
  const channel = useTrafficStore((s) => s.trackingChannel)
  const close = useTrafficStore((s) => s.closeTracking)
  const openTracking = useTrafficStore((s) => s.openTracking)

  if (!channel) return null

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <aside className="drawer track-drawer">
        <div className="drawer-head">
          {channel !== 'all' && <ChannelIcon channel={channel} size={15} />}
          <strong>{channel === 'all' ? 'Channel infrastructure' : CHANNELS[channel].label}</strong>
          <span className="track-drawer-sub">infrastructure</span>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={close}>
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {channel === 'all' ? <AllView openTracking={openTracking} /> : <ChannelView channel={channel} />}
        </div>

        <div className="drawer-foot">
          <span className="track-drawer-note">
            Status is a workspace stand-in. Connect each platform / your tag manager to confirm live firing.
          </span>
        </div>
      </aside>
    </>
  )
}

function ChannelView({ channel }: { channel: ChannelId }) {
  const st = channelTracking(channel)
  const done = st.ready === st.total
  return (
    <div className="track-drawer-panel">
      <div className="track-drawer-readout">
        <span className={`track-ready${done ? ' done' : ''}`}>
          {st.ready}/{st.total} set up
        </span>
        {!done && <span className="track-drawer-gap">{st.total - st.ready} to go</span>}
      </div>
      <div className="track-drawer-items">
        {st.items.map(({ item, installed }) => (
          <div key={item.label} className={`track-drawer-item${installed ? ' on' : ''}`}>
            <span className={`track-dot${installed ? ' on' : ''}`} />
            <div className="track-drawer-item-body">
              <div className="track-drawer-item-label">{item.label}</div>
              <div className="track-drawer-item-kind">{TRACKING_KIND_LABEL[item.kind]}</div>
            </div>
            <span className={`track-drawer-state${installed ? ' on' : ''}`}>
              {installed ? '✓ set up' : 'needed'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AllView({ openTracking }: { openTracking: (c: ChannelId) => void }) {
  return (
    <div className="track-drawer-panel">
      {KIND_ORDER.map((section) => (
        <div key={section.kind} className="track-group">
          <div className="track-group-label">{section.label}</div>
          {channelsByKind(section.kind).map((c) => {
            const st = channelTracking(c.id)
            const missing = st.items.filter((x) => !x.installed).map((x) => x.item.label)
            const done = st.ready === st.total
            return (
              <button key={c.id} className="track-drawer-chan" onClick={() => openTracking(c.id)}>
                <ChannelIcon channel={c.id} size={15} />
                <span className="track-drawer-chan-name">{c.label}</span>
                {missing.length > 0 && (
                  <span className="track-drawer-missing">needs {missing.join(', ')}</span>
                )}
                <span className="spacer" />
                <span className={`track-ready${done ? ' done' : ''}`}>
                  {st.ready}/{st.total}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
