import { DIMENSION_PRESETS, FANOUT_DIMENSIONS, dimensionValues } from '../domain/fanout'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The brand-level personalization facts — the standing dimensions that are true
 * across every campaign: who the brand serves (Audience, sourced from the Messaging
 * library) and what languages it speaks. The tactical dimensions (location, time,
 * behavior, lifecycle, intent, tier, device, account, channel, journey) are chosen
 * per campaign on the canvas Personalize card, not fixed here.
 */

// Only the genuinely brand-standing dimensions live here.
const BRAND_DIMENSIONS = new Set(['audience', 'language'])
// Sourced from the library / funnel, not edited here.
const READONLY = new Set(['audience', 'journey'])

const uniq = (arr: string[]) => [...new Set(arr)]

export function BrandPersonalization({ brand }: { brand: string }) {
  const brandSystems = useTrafficStore((s) => s.brandSystems)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)

  const profile = clientProfiles[brand]
  const dims = FANOUT_DIMENSIONS.filter((d) => BRAND_DIMENSIONS.has(d.key))

  const valuesFor = (key: string): string[] => profile?.personalization?.[key] ?? []
  // Instant save, like the Channels picker.
  const writeValues = (key: string, next: string[]) => {
    const map = { ...(profile?.personalization ?? {}) }
    if (next.length) map[key] = next
    else delete map[key]
    setClientProfile(brand, { personalization: map })
  }
  const toggleValue = (key: string, value: string) => {
    const cur = valuesFor(key)
    writeValues(key, cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value])
  }
  const addValue = (key: string, raw: string) => {
    const v = raw.trim()
    const cur = valuesFor(key)
    if (v && !cur.includes(v)) writeValues(key, [...cur, v])
  }

  const readyCount = dims.filter((d) => dimensionValues(d.key, brandSystems[brand], profile).length > 0).length

  return (
    <div className="brand-info brand-voice brand-pz">
      <p className="brand-voice-intro">
        The standing facts <strong>{brand}</strong> personalizes on across every campaign. Everything
        tactical (location, time, behavior, lifecycle, and the rest) is chosen per campaign on the
        canvas Personalize card.{' '}
        <span className="pz-ready">
          {readyCount} of {dims.length} set.
        </span>
      </p>

      <div className="pz-dims">
        {dims.map((d) => {
          if (READONLY.has(d.key)) {
            const values = dimensionValues(d.key, brandSystems[brand], profile)
            return (
              <section className="pz-dim" key={d.key}>
                <div className="pz-dim-head">
                  <h2 className="voice-section-title">{d.label}</h2>
                  <span className="voice-section-sub">{d.source}</span>
                  <span className="pz-dim-count">{values.length}</span>
                </div>
                {values.length ? (
                  <div className="voice-chips readonly">
                    {values.map((v) => (
                      <span className="voice-chip readonly" key={v}>
                        {v}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="pz-dim-note">No audiences yet — add them in the brand’s Messaging library.</p>
                )}
              </section>
            )
          }

          const values = valuesFor(d.key)
          const options = uniq([...(DIMENSION_PRESETS[d.key] ?? []), ...values])
          return (
            <section className="pz-dim" key={d.key}>
              <div className="pz-dim-head">
                <h2 className="voice-section-title">{d.label}</h2>
                <span className="voice-section-sub">{d.source}</span>
                <span className="pz-dim-count">{values.length}</span>
              </div>
              <div className="chn-grid pz-grid">
                {options.map((opt) => {
                  const on = values.includes(opt)
                  return (
                    <button
                      key={opt}
                      className={`chn-pick${on ? ' on' : ''}`}
                      onClick={() => toggleValue(d.key, opt)}
                      aria-pressed={on}
                    >
                      <span className="chn-pick-label">{opt}</span>
                      <span className="chn-pick-check">{on ? '✓' : '+'}</span>
                    </button>
                  )
                })}
              </div>
              <input
                className="pz-custom"
                placeholder="Add a custom value and press Enter"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addValue(d.key, e.currentTarget.value)
                    e.currentTarget.value = ''
                  }
                }}
              />
            </section>
          )
        })}
      </div>
    </div>
  )
}
