import { freshRecordId, type RecordColumn, type RecordField } from './records'
import { AGE_RANGES, INCOME_RANGES } from './taxonomy'

/**
 * A Person record — the "Records › People" table, the contacts side of the lightweight
 * CRM. Same hand-editable, no-fabrication approach as Companies: seed only names, roles,
 * and the company they belong to; leave email/location blank for the user to fill.
 */
export interface Person {
  id: string
  /** Which brand's workspace this record belongs to (scoped by the rail). Untagged = shows for all. */
  brand?: string
  name: string
  title?: string
  company?: string
  email?: string
  location?: string
  status?: 'lead' | 'contact' | 'champion' | ''
  phone?: string
  linkedin?: string
  owner?: string
  notes?: string

  // ---- PERSONA: a composite person the copy is written to -------------------------------------
  //
  // Not a second contact record. A segment holds the distribution (ageRanges, incomeRanges, geos);
  // a persona is ONE concrete instance of it, and that is what makes copy sound written to somebody
  // rather than to a bracket. Composite by definition: these describe a representative person, never
  // a real customer, so the writer may extrapolate consistent colour but must never present them as
  // a testimonial or attribute a quote to them.
  //
  // Every field here earns its place by changing a sentence. Anything that only classifies (gender,
  // marital status) is profiling rather than briefing and is deliberately absent.

  /** Their actual age, not the segment's band. */
  age?: string
  /** Household income as they would say it ("about $95k"), for what "worth it" means to them. */
  householdIncome?: string
  /** What they do all day. `title` is the B2B word for the same thing; this is the consumer one. */
  occupation?: string
  /** What else competes for the same Saturday and the same money. */
  hobbies?: string
  /**
   * One phrase they would really use. The single most copy-changing field here: a persona that does
   * not fix vocabulary produces the same copy with a name on it.
   */
  saysLike?: string
  /** The incumbent or workaround being displaced. "You check three weather apps" only lands if true. */
  usesNow?: string
  /** How much they already know, which decides how much the copy explains. */
  expertise?: string
  /** What they are actually trying to achieve. Not the pain: the pain is what stops them. */
  optimizingFor?: string
  /** When and where they would read this, which sets length and urgency. */
  readsWhen?: string
  /** Who else is in the decision: a spouse, a crew, a buying committee. */
  decidesWith?: string
}

/** The persona fields, in the order they are asked for and sent. */
export const PERSONA_KEYS = [
  'age', 'householdIncome', 'occupation', 'hobbies', 'saysLike',
  'usesNow', 'expertise', 'optimizingFor', 'readsWhen', 'decidesWith',
] as const

/** Does this person carry enough persona to be worth sending to the writer? */
export const hasPersona = (p: Person): boolean =>
  PERSONA_KEYS.some((k) => String(p[k] ?? '').trim())

export const PEOPLE_COLUMNS: RecordColumn[] = [
  { key: 'name', label: 'Name', kind: 'name', width: 200, group: 'Identity' },
  { key: 'title', label: 'Title', kind: 'text', width: 180, group: 'Identity' },
  { key: 'company', label: 'Company', kind: 'ref', width: 160, group: 'Identity' },
  { key: 'status', label: 'Status', kind: 'status', width: 120, group: 'Identity' },
  { key: 'email', label: 'Email', kind: 'text', width: 220, group: 'Contact' },
  { key: 'location', label: 'Location', kind: 'text', width: 150, group: 'Contact' },
]

// The full attribute set shown in a person's detail panel (a superset of the columns).
/**
 * PICK-LISTS FOR THE PERSONA. A composite person is a BRACKET, not a dossier, so most of these
 * fields have a genuinely short list of real answers and typing a bespoke one adds nothing: "42"
 * pretends to a precision the persona does not have, where "35-44" says what is actually known.
 *
 * The four fields left as free text are the ones where the specific words ARE the value: what they
 * do, what they are into, what they use today, and how they talk. A dropdown there would flatten
 * the persona into the same handful of people for every brand, which is the failure mode personas
 * are supposed to prevent.
 */
/**
 * ONE vocabulary per fact. These were a second set of bands with different edges AND different dash
 * characters from the AGE_RANGES / INCOME_RANGES the audience records already used, so a persona and
 * a segment describing the same people could never match, and no report could join them.
 */
export const AGE_BANDS = AGE_RANGES

export const INCOME_BANDS = INCOME_RANGES

export const EXPERTISE_LEVELS = [
  'New to this', 'Knows the basics', 'Does this a lot', 'Expert',
] as const

/** The motive, phrased as a sentence rather than a one-word category: "Time" tells a writer nothing,
 *  "Not wasting their time" is already half a headline. */
export const MOTIVES = [
  'Not wasting their time',
  'Not spending more than they have to',
  'Not getting it wrong',
  'Not looking stupid in front of someone',
  'Keeping it simple',
  'Staying in control of it',
  'Getting it over with',
  'Being the one who found it first',
] as const

export const READING_MOMENTS = [
  'First thing, before the day starts',
  'On the commute',
  'At their desk, mid-task',
  'Over lunch',
  'Evening, winding down',
  'At the weekend',
  'The moment the problem hits',
] as const

export const DECIDERS = [
  'Nobody, they just decide',
  'Their partner',
  'A friend who knows the space',
  'A colleague',
  'Their manager signs off',
  'A committee or procurement',
] as const

export const PEOPLE_FIELDS: RecordField[] = [
  { key: 'name', label: 'Name', kind: 'name', group: 'Identity' },
  { key: 'title', label: 'Title', kind: 'text', group: 'Identity' },
  { key: 'company', label: 'Company', kind: 'ref', group: 'Identity' },
  { key: 'status', label: 'Status', kind: 'status', group: 'Identity' },
  { key: 'email', label: 'Email', kind: 'text', group: 'Contact' },
  { key: 'phone', label: 'Phone', kind: 'text', group: 'Contact' },
  { key: 'linkedin', label: 'LinkedIn', kind: 'url', group: 'Contact' },
  { key: 'location', label: 'Location', kind: 'text', group: 'Contact' },
  { key: 'owner', label: 'Relationship owner', kind: 'text', group: 'Relationship' },
  { key: 'notes', label: 'Notes', kind: 'multiline', group: 'Relationship' },
  // The persona, grouped so it reads as one idea rather than ten more contact fields.
  { key: 'occupation', label: 'Occupation', kind: 'text', group: 'Persona' },
  { key: 'age', label: 'Age', kind: 'text', group: 'Persona', options: AGE_BANDS },
  { key: 'householdIncome', label: 'Household income', kind: 'text', group: 'Persona', options: INCOME_BANDS },
  { key: 'hobbies', label: 'Hobbies and interests', kind: 'text', group: 'Persona' },
  { key: 'expertise', label: 'How much they know', kind: 'text', group: 'Persona', options: EXPERTISE_LEVELS },
  { key: 'optimizingFor', label: 'What they want', kind: 'text', group: 'Persona', options: MOTIVES },
  { key: 'usesNow', label: 'What they use today', kind: 'multiline', group: 'Persona' },
  { key: 'saysLike', label: 'How they talk', kind: 'multiline', group: 'Persona' },
  { key: 'readsWhen', label: 'When they would read this', kind: 'text', group: 'Persona', options: READING_MOMENTS },
  { key: 'decidesWith', label: 'Who else decides', kind: 'text', group: 'Persona', options: DECIDERS },
]

export const PEOPLE_STATUSES: NonNullable<Person['status']>[] = ['lead', 'contact', 'champion']

export function freshPersonId(): string {
  return freshRecordId('pe')
}

// Seed drawn from real, publicly-known client contacts — names, roles, and company only.
// Emails and locations are left blank so nothing is invented.
const SEED: Omit<Person, 'id'>[] = [
  { name: 'Jonathan Shooshani', title: 'President', company: 'Joon', status: 'contact' },
  { name: 'Sebastian Elghanian', title: 'CEO', company: 'Joon', status: 'contact' },
]

export function seedPeople(): Person[] {
  return SEED.map((p) => ({ ...p, id: freshPersonId() }))
}
