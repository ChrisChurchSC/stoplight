import type { AudienceType } from '../domain/audiences'
import { CHANNEL_LIST } from '../domain/channels'
import type { Rtb } from '../domain/rtb'
import { GTM_STRATEGIES } from '../domain/strategies'
import {
  AGE_RANGES,
  BUYING_TRIGGERS,
  COMPANY_SIZES,
  GENDERS,
  GOAL_LIBRARY,
  INCOME_RANGES,
  INDUSTRIES,
  JOB_FUNCTIONS,
  PAIN_LIBRARY,
  REGIONS,
  SENIORITIES,
} from '../domain/taxonomy'
import { ChannelIcon } from './ChannelIcon'
import { ChipMulti, Dropdown, Segmented } from './forms'

type Section = 'identity' | 'needs' | 'reach'

interface Props {
  value: AudienceType
  patch: (p: Partial<AudienceType>) => void
  section: Section
  businessModel?: string
  icpPains?: string[]
  rtbPool?: Rtb[]
}

/**
 * The detailed, selector-driven audience builder fields, grouped into three
 * sections so they can stack in one form (the new-client wizard) or split across
 * steps (the standalone audience flow). Demographics vs firmographics are ordered
 * by the client's business model — B2C leads with people, B2B with firms.
 */
export function AudienceFields({ value, patch, section, businessModel, icpPains, rtbPool }: Props) {
  const model = businessModel ?? ''
  const isB2C = /B2C|D2C/i.test(model)
  const painOptions = [...new Set([...(icpPains ?? []), ...PAIN_LIBRARY])]

  if (section === 'identity') {
    const demographics = (
      <>
        <label className="wiz-label">Age ranges</label>
        <ChipMulti options={AGE_RANGES} value={value.ageRanges} onChange={(v) => patch({ ageRanges: v })} />
        <label className="wiz-label">Household income</label>
        <ChipMulti options={INCOME_RANGES} value={value.incomeRanges} onChange={(v) => patch({ incomeRanges: v })} />
        <label className="wiz-label">Gender</label>
        <Segmented options={GENDERS} value={value.gender} onChange={(v) => patch({ gender: v })} />
      </>
    )
    const firmographics = (
      <>
        <label className="wiz-label">Job functions / titles</label>
        <ChipMulti options={JOB_FUNCTIONS} value={value.functions} onChange={(v) => patch({ functions: v })} />
        <div className="wiz-grid2">
          <label className="wiz-field">
            <span className="wiz-label">Seniority</span>
            <Dropdown options={SENIORITIES} value={value.seniority} onChange={(v) => patch({ seniority: v })} />
          </label>
          <label className="wiz-field">
            <span className="wiz-label">Their industry</span>
            <Dropdown options={INDUSTRIES} value={value.industry} onChange={(v) => patch({ industry: v })} placeholder="Same as client" />
          </label>
        </div>
        <label className="wiz-label">Company size they work at</label>
        <Dropdown options={COMPANY_SIZES} value={value.companySize} onChange={(v) => patch({ companySize: v })} placeholder="Any size" />
      </>
    )
    return (
      <>
        <label className="wiz-label">Role / title</label>
        <input
          className="wiz-input"
          value={value.role}
          placeholder="e.g. VP of Operations"
          onChange={(e) => patch({ role: e.target.value })}
        />
        {isB2C ? (
          <>
            {demographics}
            {firmographics}
          </>
        ) : (
          <>
            {firmographics}
            {demographics}
          </>
        )}
        <label className="wiz-label">Regions</label>
        <ChipMulti options={REGIONS} value={value.geos} onChange={(v) => patch({ geos: v })} />
      </>
    )
  }

  if (section === 'needs') {
    return (
      <>
        <label className="wiz-label">Pain points</label>
        <ChipMulti options={painOptions} value={value.pains} onChange={(v) => patch({ pains: v })} />
        <label className="wiz-label">Goals</label>
        <ChipMulti options={GOAL_LIBRARY} value={value.goalTags} onChange={(v) => patch({ goalTags: v })} />
        <label className="wiz-label">Buying triggers / intent</label>
        <ChipMulti options={BUYING_TRIGGERS} value={value.triggers} onChange={(v) => patch({ triggers: v })} />
        <label className="wiz-label">Objections</label>
        <textarea
          className="wiz-input wiz-textarea"
          value={value.objections}
          placeholder="What makes them hesitate — objections to disarm in the messaging."
          onChange={(e) => patch({ objections: e.target.value })}
        />
        <label className="wiz-label">Message angle</label>
        <textarea
          className="wiz-input wiz-textarea"
          value={value.messageAngle}
          placeholder="How the campaign promise is framed for this buyer's pains and language."
          onChange={(e) => patch({ messageAngle: e.target.value })}
        />
      </>
    )
  }

  // section === 'reach'
  const toggleChannel = (id: (typeof CHANNEL_LIST)[number]['id']) =>
    patch({
      channels: value.channels.includes(id)
        ? value.channels.filter((x) => x !== id)
        : [...value.channels, id],
    })
  return (
    <>
      <label className="wiz-label">Channels to reach them</label>
      <div className="chip-multi">
        {CHANNEL_LIST.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip-opt${value.channels.includes(c.id) ? ' on' : ''}`}
            onClick={() => toggleChannel(c.id)}
            title={c.label}
          >
            <ChannelIcon channel={c.id} size={12} />
            {c.label}
          </button>
        ))}
      </div>

      {rtbPool && rtbPool.length > 0 && (
        <>
          <label className="wiz-label">Proof emphasis</label>
          <div className="chip-multi">
            {rtbPool.map((rtb) => (
              <button
                key={rtb.id}
                type="button"
                className={`chip-opt${value.rtbEmphasis.includes(rtb.id) ? ' on' : ''}`}
                title={rtb.detail}
                onClick={() =>
                  patch({
                    rtbEmphasis: value.rtbEmphasis.includes(rtb.id)
                      ? value.rtbEmphasis.filter((x) => x !== rtb.id)
                      : [...value.rtbEmphasis, rtb.id],
                  })
                }
              >
                {rtb.label}
              </button>
            ))}
          </div>
        </>
      )}

      <label className="wiz-label">Strategy</label>
      <select
        className="wiz-input"
        value={value.strategy}
        onChange={(e) => patch({ strategy: e.target.value })}
      >
        <option value="">No strategy yet…</option>
        {GTM_STRATEGIES.map((g) => (
          <option key={g.key} value={g.key}>
            {g.name}
          </option>
        ))}
      </select>
    </>
  )
}
