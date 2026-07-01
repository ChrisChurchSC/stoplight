import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The Foundation's standing read of the brand: a detailed company overview of who
 * they are, what they do, who works there, how they show up, and how they speak.
 * Built from the client profile — facts captured at intake + filled in by site
 * ingestion — plus the brand voice. Proof + CTAs live in their own panel.
 */
export function CompanyProfile() {
  const company = useTrafficStore((s) => s.clientFilter)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const brandGuides = useTrafficStore((s) => s.brandGuides)
  const openReadiness = useTrafficStore((s) => s.openReadiness)

  const profile = clientProfiles[company]
  const bg = brandGuides[company]
  const guide = bg?.guide
  const confirmed = bg?.confirmed
  const voice = guide?.voice || profile?.voice || ''

  const web = profile?.website
  const webHref = web ? (/^https?:\/\//.test(web) ? web : `https://${web}`) : undefined
  const webLabel = web?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')

  const facts: [string, string][] = (
    [
      ['Industry', profile?.industry],
      ['Founded', profile?.founded],
      ['Headquarters', profile?.headquarters],
      ['Business model', profile?.businessModel],
      ['Company size', profile?.companySize],
      ['Region', profile?.region],
      ['Revenue', profile?.revenue],
      ['Funding', profile?.funding],
    ] as [string, string | undefined][]
  ).filter((f): f is [string, string] => !!f[1]?.trim())

  // Which ingest sources are wired — the "how we know" behind the overview.
  const sources: string[] = []
  const chCount = profile?.channels?.length ?? 0
  if (chCount) sources.push(`${chCount} channel${chCount === 1 ? '' : 's'}`)
  if (profile?.sanity?.projectId) sources.push('Sanity')
  if (profile?.resend?.apiKey) sources.push('Resend')
  if (profile?.googleAds?.developerToken) sources.push('Google Ads')

  const hasDetail =
    facts.length > 0 ||
    !!voice ||
    sources.length > 0 ||
    !!profile?.mission ||
    !!profile?.oneLiner ||
    !!profile?.traction ||
    (profile?.team?.length ?? 0) > 0 ||
    (profile?.products?.length ?? 0) > 0 ||
    (profile?.differentiators?.length ?? 0) > 0 ||
    (profile?.notableClients?.length ?? 0) > 0 ||
    (profile?.values?.length ?? 0) > 0

  return (
    <section className="fnd-panel fnd-company">
      <div className="fnd-panel-head">
        <h2 className="fnd-panel-title">Company overview</h2>
        <div className="fnd-co-headright">
          <button className="fnd-co-edit" onClick={openReadiness} title="Edit voice & descriptors in Readiness">
            ✎ Readiness
          </button>
          <span className={`fnd-tag ${confirmed ? 'ok' : 'todo'}`}>
            {confirmed ? '✓ Confirmed' : guide ? 'Draft' : 'Not set'}
          </span>
        </div>
      </div>

      {/* Detailed company overview */}
      <div className="fnd-co-overview">
          <div className="fnd-co-id">
            <span className="fnd-co-name">{company}</span>
            {webHref && (
              <a className="fnd-co-web" href={webHref} target="_blank" rel="noreferrer">
                {webLabel}
              </a>
            )}
          </div>

          {profile?.oneLiner && <p className="fnd-co-oneliner">{profile.oneLiner}</p>}

          {profile?.traction && <div className="fnd-co-traction">{profile.traction}</div>}

          {profile?.mission && (
            <div className="fnd-co-block">
              <span className="fnd-co-k">Mission</span>
              <p className="fnd-co-text">{profile.mission}</p>
            </div>
          )}

          {facts.length > 0 && (
            <div className="fnd-co-facts">
              {facts.map(([k, v]) => (
                <div key={k} className="fnd-co-fact">
                  <span className="fnd-co-k">{k}</span>
                  <span className="fnd-co-v">{v}</span>
                </div>
              ))}
            </div>
          )}

          {profile?.products?.length ? (
            <div className="fnd-co-block">
              <span className="fnd-co-k">What they offer</span>
              <div className="fnd-co-tags">
                {profile.products.map((p) => (
                  <span key={p} className="fnd-co-tag">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {profile?.differentiators?.length ? (
            <div className="fnd-co-block">
              <span className="fnd-co-k">What sets them apart</span>
              <ul className="fnd-co-list">
                {profile.differentiators.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {profile?.notableClients?.length ? (
            <div className="fnd-co-block">
              <span className="fnd-co-k">Clients &amp; partners</span>
              <div className="fnd-co-tags">
                {profile.notableClients.map((c) => (
                  <span key={c} className="fnd-co-tag">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {profile?.values?.length ? (
            <div className="fnd-co-block">
              <span className="fnd-co-k">Values</span>
              <div className="fnd-co-tags">
                {profile.values.map((v) => (
                  <span key={v} className="fnd-co-tag">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {profile?.team?.length ? (
            <div className="fnd-co-block">
              <span className="fnd-co-k">Team</span>
              <div className="fnd-co-team">
                {profile.team.map((m, i) => (
                  <span key={i} className="fnd-co-person">
                    <span className="fnd-co-person-name">{m.name}</span>
                    {m.role && <span className="fnd-co-person-role">{m.role}</span>}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {sources.length > 0 && (
            <div className="fnd-co-sources">
              <span className="fnd-co-k">Sources</span>
              {sources.map((s) => (
                <span key={s} className="fnd-co-src">
                  {s}
                </span>
              ))}
            </div>
          )}

          {voice && (
            <div className="fnd-co-block">
              <span className="fnd-co-k">Voice</span>
              <p className="fnd-co-text">{voice}</p>
            </div>
          )}

          {!hasDetail && (
            <p className="fnd-empty">
              No company detail yet — ingest the brand's site and channels to fill this in.
            </p>
          )}
        </div>

    </section>
  )
}
