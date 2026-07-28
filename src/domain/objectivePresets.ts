/**
 * OBJECTIVE PRESETS: the standard things a campaign can be for, always offered.
 *
 * The campaign card used to offer only the brand's own Objective RECORDS, and hid the control
 * entirely when there were none — so a new brand had no way to say what a campaign was for until
 * somebody went to Records and invented an objective from a blank field. That is the wrong order:
 * "what is this campaign for" has a short list of real answers, and picking from it is faster and
 * more consistent than writing one.
 *
 * Each carries the metric it is normally measured by, so choosing an objective fills the KPI too.
 * The brand's own records still appear alongside these: a preset is a starting point, not a
 * replacement for an objective somebody has defined precisely.
 *
 * Deliberately short. A longer list would be a taxonomy to study rather than a menu to pick from,
 * and every extra entry makes the difference between two of them less clear.
 */
export interface ObjectivePreset {
  id: string
  name: string
  /** The metric it is normally measured by, used as the campaign's KPI when there is no other. */
  kpi: string
  /** What it is for, one line, shown under the picker once chosen. */
  hint: string
}

export const OBJECTIVE_PRESETS: ObjectivePreset[] = [
  {
    id: 'awareness',
    name: 'Build awareness',
    kpi: 'Reach',
    hint: 'Reach people who do not know you yet. Judged on how many saw it, not on what they did next.',
  },
  {
    id: 'demand',
    name: 'Generate demand',
    kpi: 'Qualified leads',
    hint: 'Turn interest into named people you can follow up with.',
  },
  {
    id: 'pipeline',
    name: 'Create pipeline',
    kpi: 'Pipeline created',
    hint: 'Open real opportunities, measured in money rather than in contacts.',
  },
  {
    id: 'signups',
    name: 'Drive sign-ups',
    kpi: 'Sign-ups',
    hint: 'Get people to start: a trial, an account, a free tier.',
  },
  {
    id: 'activation',
    name: 'Activate new users',
    kpi: 'Activated accounts',
    hint: 'Get the people who signed up to the point where the product has actually done something for them.',
  },
  {
    id: 'conversion',
    name: 'Convert to paid',
    kpi: 'Conversion rate',
    hint: 'Move people who are already using you onto a plan.',
  },
  {
    id: 'retention',
    name: 'Keep customers',
    kpi: 'Retention rate',
    hint: 'Hold on to the customers you have. Aimed at people already paying.',
  },
  {
    id: 'expansion',
    name: 'Expand accounts',
    kpi: 'Expansion revenue',
    hint: 'Sell more to customers you already have: a bigger plan, another team, another product.',
  },
  {
    id: 'attendance',
    name: 'Fill an event',
    kpi: 'Registrations',
    hint: 'Get people to a webinar, a launch or a live session by a fixed date.',
  },
  {
    id: 'authority',
    name: 'Build authority',
    kpi: 'Organic sessions',
    hint: 'Be the source people find and cite on a subject. Compounds slowly; judged over quarters.',
  },
]

export const objectivePresetByName = (name: string | undefined): ObjectivePreset | undefined =>
  name ? OBJECTIVE_PRESETS.find((p) => p.name === name) : undefined
