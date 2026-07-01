import { useEffect, useState } from 'react'
import { FANOUT_DIMENSIONS, dimensionValues } from '../domain/fanout'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChipInput } from './ChipInput'

/**
 * The personalization guide inside a brand folder — the dimensions the brand fans
 * messaging across, and the standing values for each. What you set here feeds the
 * Personalize card on every one of the brand's canvases: a card fans a base message
 * into one variant per value of its dimension.
 *
 * Two dimensions are sourced elsewhere and shown read-only: Audience comes from the
 * brand's Messaging library, Journey from the fixed funnel. Location has its own store
 * (`locations`); every other dimension's values live on the profile's `personalization`
 * map. Editing any of them here flows straight into fan-out via `dimensionValues`.
 */

// Sourced from the library / funnel, not edited here.
const READONLY = new Set(['audience', 'journey'])

export function BrandPersonalization({ brand }: { brand: string }) {
  const brandSystems = useTrafficStore((s) => s.brandSystems)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)

  const [locations, setLocations] = useState<string[]>([])
  const [perDim, setPerDim] = useState<Record<string, string[]>>({})
  const [dirty, setDirty] = useState(false)

  // Seed from the stored profile when the brand changes.
  useEffect(() => {
    const p = clientProfiles[brand]
    setLocations(p?.locations ?? [])
    setPerDim({ ...(p?.personalization ?? {}) })
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand])

  const getValues = (key: string): string[] => (key === 'location' ? locations : perDim[key] ?? [])
  const setValues = (key: string, next: string[]) => {
    if (key === 'location') setLocations(next)
    else setPerDim((prev) => ({ ...prev, [key]: next }))
    setDirty(true)
  }

  const save = () => {
    const cleaned: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(perDim)) if (v.length) cleaned[k] = v
    setClientProfile(brand, { locations, personalization: cleaned })
    setDirty(false)
  }

  // Live count of dimensions this brand can actually fan across (has ≥1 value).
  const readyCount = FANOUT_DIMENSIONS.filter(
    (d) => dimensionValues(d.key, brandSystems[brand], { locations, personalization: perDim }).length > 0,
  ).length

  return (
    <div className="brand-info brand-voice brand-pz">
      <p className="brand-voice-intro">
        The dimensions <strong>{brand}</strong> personalizes across. Values here feed the Personalize card on every{' '}
        {brand} canvas, which fans a message into one variant per value.{' '}
        <span className="pz-ready">
          {readyCount} of {FANOUT_DIMENSIONS.length} dimensions ready.
        </span>
      </p>

      <div className="pz-dims">
        {FANOUT_DIMENSIONS.map((d) => {
          const readonly = READONLY.has(d.key)
          const values = readonly
            ? dimensionValues(d.key, brandSystems[brand], clientProfiles[brand])
            : getValues(d.key)
          return (
            <section className="pz-dim" key={d.key}>
              <div className="pz-dim-head">
                <h2 className="voice-section-title">{d.label}</h2>
                <span className="voice-section-sub">{d.source}</span>
                <span className="pz-dim-count">{values.length}</span>
              </div>
              {readonly ? (
                values.length ? (
                  <div className="voice-chips readonly">
                    {values.map((v) => (
                      <span className="voice-chip readonly" key={v}>
                        {v}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="pz-dim-note">
                    {d.key === 'audience'
                      ? 'No audiences yet — add them in the brand’s Messaging library.'
                      : 'Sourced from the funnel.'}
                  </p>
                )
              ) : (
                <ChipInput
                  values={values}
                  onChange={(v) => setValues(d.key, v)}
                  placeholder={placeholderFor(d.key)}
                />
              )}
            </section>
          )
        })}
      </div>

      <div className="voice-savebar">
        <button className="btn primary sm" onClick={save} disabled={!dirty}>
          {dirty ? '✓ Save personalization' : 'Saved'}
        </button>
        {dirty && <span className="voice-savebar-hint">Unsaved changes</span>}
      </div>
    </div>
  )
}

function placeholderFor(key: string): string {
  switch (key) {
    case 'location':
      return 'e.g. Asbury Park, Belmar, Manasquan'
    case 'channel':
      return 'e.g. Instagram, Email, Meta Ads'
    case 'behavior':
      return 'e.g. Cart abandon, Viewed pricing, Repeat buyer'
    case 'time':
      return 'e.g. Summer, Black Friday, Off-season'
    case 'device':
      return 'e.g. Mobile, Desktop, In-store'
    case 'lifecycle':
      return 'e.g. New, Active, Lapsed, Win-back'
    case 'language':
      return 'e.g. English, Spanish, French'
    case 'intent':
      return 'e.g. Paid search, Organic, Referral'
    case 'tier':
      return 'e.g. VIP, Standard, Prospect'
    case 'account':
      return 'e.g. Acme Co, Globex, Initech'
    default:
      return 'Add a value and press Enter'
  }
}
