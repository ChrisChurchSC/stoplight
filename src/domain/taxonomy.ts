/**
 * Curated option libraries for client + audience intake. Everything the wizards
 * offer as a dropdown or chip-selector lives here, so the captured data is
 * structured (queryable, sliceable in the outcome map) rather than free text.
 */

// ---- Client (the business) ----
export const BUSINESS_MODELS = ['B2C', 'B2B', 'B2B2C', 'D2C', 'B2G', 'Marketplace'] as const
export type BusinessModel = (typeof BUSINESS_MODELS)[number]

export const INDUSTRIES = [
  'B2B SaaS',
  'Consumer SaaS',
  'FinTech',
  'Healthcare / HealthTech',
  'E-commerce / Retail',
  'Education / EdTech',
  'Manufacturing',
  'Real Estate / PropTech',
  'Media & Entertainment',
  'Hospitality & Travel',
  'Professional Services',
  'Logistics & Supply Chain',
  'Energy & Utilities',
  'Government / Public Sector',
  'Nonprofit',
  'Food & Beverage',
  'Automotive',
  'Telecommunications',
  'Other',
]

export const COMPANY_SIZES = [
  '1–10',
  '11–50',
  '51–200',
  '201–500',
  '501–1,000',
  '1,001–5,000',
  '5,000+',
]

export const REVENUE_RANGES = [
  'Pre-revenue',
  '<$1M',
  '$1M–$10M',
  '$10M–$50M',
  '$50M–$200M',
  '$200M–$1B',
  '$1B+',
]

export const FUNDING_STAGES = [
  'Bootstrapped',
  'Pre-seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Series D+',
  'PE-backed',
  'Public',
]

export const REGIONS = [
  'Within a few miles',
  'This town or city',
  'This county or state',
  'North America',
  'EMEA',
  'APAC',
  'LATAM',
  'United States',
  'Canada',
  'United Kingdom',
  'Europe',
  'Global',
]

export const BRAND_VOICES = [
  'Plain & technical',
  'Bold & punchy',
  'Warm & human',
  'Authoritative',
  'Playful',
  'Premium / aspirational',
  'No hype, proof-led',
]

// ---- Audience (the person) ----
export const AGE_RANGES = ['18–24', '25–34', '35–44', '45–54', '55–64', '65+']

export const INCOME_RANGES = [
  '<$35k',
  '$35k–$50k',
  '$50k–$75k',
  '$75k–$100k',
  '$100k–$150k',
  '$150k–$250k',
  '$250k+',
]

export const GENDERS = ['All', 'Female', 'Male', 'Non-binary']

/** Marital / household status — a consumer (B2C) demographic. */
export const MARITAL_STATUSES = ['Single', 'Married', 'Partnered', 'Divorced', 'Widowed', 'Any']

/** How valuable / high-priority an audience is to the brand. */
export const VALUE_TIERS = ['Primary', 'Secondary', 'Tertiary']

export const SENIORITIES = [
  'Individual contributor',
  'Manager',
  'Director',
  'VP',
  'C-suite / Founder',
]

/** Job functions / titles — selectable for B2B audiences. */
export const JOB_FUNCTIONS = [
  'Operations',
  'RevOps',
  'Marketing',
  'Sales',
  'Engineering',
  'Product',
  'Finance',
  'Human Resources',
  'IT',
  'Customer Success',
  'Procurement',
  'Legal',
  'Executive / Founder',
  'Data / Analytics',
  'Clinical / Medical',
  'Security / Risk',
  'Facilities',
]

/**
 * STARTER VOCABULARIES, GROUPED BY WHO THE BRAND SELLS TO.
 *
 * These were one flat list each, and every entry assumed a company buying software — "compliance
 * risk", "data silos", "new funding round". For a brand selling to anglers, or donors, or homeowners,
 * the whole list was noise, and the picker's promise ("here is a starting point") became a lie the
 * moment you were not B2B.
 *
 * Grouped rather than filtered, because a brand is not reliably one or the other: an agency sells to
 * businesses about their consumers, and a nonprofit has both donors and corporate partners. The
 * picker shows the headings and lets the reader choose, which costs nothing and never hides the right
 * answer. The brand's OWN recorded values still sort above all of these.
 */
export interface VocabGroup {
  label: string
  options: string[]
}

export const PAIN_GROUPS: VocabGroup[] = [
  {
    label: 'Selling to people',
    options: [
      'wasting a day off',
      'not knowing whether it is worth doing',
      'having to check several places to get one answer',
      'paying for something they barely use',
      'buying the wrong thing and having to redo it',
      'getting advice from someone who is selling to them',
      'waiting too long for an appointment',
      'not being able to reach a human',
      'losing track of what they have spent',
      'feeling like it is meant for professionals, not them',
      'it arrived late, damaged or not as pictured',
      'sending it back is more trouble than it is worth',
      'running out and noticing too late',
      'never being sure it will fit or suit them',
    ],
  },
  {
    label: 'Selling to businesses',
    options: [
      'not enough new customers coming in',
      'good people are hard to find and harder to keep',
      'cash flow is unpredictable',
      'the owner is doing everything themselves',
      'chasing late payments',
      'no-shows and last-minute cancellations',
      'one bad review doing real damage',
      'high costs',
      'wasted ad spend',
      'manual reporting',
      'work slipping between people and getting missed',
      'customers leaving without saying why',
      'compliance or paperwork eating the week',
      'systems that do not talk to each other',
    ],
  },
  {
    label: 'Supporters, members and audiences',
    options: [
      'not knowing whether their money made any difference',
      'being asked again the moment they give',
      'hearing only from the fundraising team',
      'not understanding what the organisation actually does',
      'wanting to help but not knowing how',
      'feeling like one of a list rather than a person',
      'missing the thing they had meant to go to',
      'not being able to find what they came for',
    ],
  },
]

/** Flat, for callers that show one ungrouped list (the audience wizard). */
export const PAIN_LIBRARY = PAIN_GROUPS.flatMap((g) => g.options)

export const GOAL_GROUPS: VocabGroup[] = [
  {
    label: 'Selling to people',
    options: [
      'not waste their own time',
      'get it right the first time',
      'stop having to think about it',
      'feel confident deciding',
      'spend less without settling',
      'do more of what they enjoy',
      'keep the household happy',
      'buy something that lasts',
      'like how it looks',
      'treat themselves',
      'buy from someone they can stand behind',
    ],
  },
  {
    label: 'Selling to businesses',
    options: [
      'win more work',
      'keep the customers they have',
      'get their evenings back',
      'stop things falling through the cracks',
      'spend less without cutting quality',
      'grow without hiring',
      'look professional to their own customers',
      'get paid faster',
      'know what is actually working',
      'reduce risk',
    ],
  },
  {
    label: 'Supporters, members and audiences',
    options: [
      'see that it worked',
      'be part of something',
      'give without it becoming a chore',
      'understand the issue properly',
      'bring other people in',
      'be recognised without being paraded',
    ],
  },
]

export const GOAL_LIBRARY = GOAL_GROUPS.flatMap((g) => g.options)

/**
 * OCCUPATIONS for a persona, as a starting vocabulary.
 *
 * Deliberately NOT the JOB_FUNCTIONS list above. That one is B2B job families for targeting a buyer
 * inside a company (RevOps, Procurement); this is what a person does for a living, which is what a
 * consumer persona needs and what shapes how they talk. A brand selling to anglers needs
 * "Electrician", not "Customer Success".
 *
 * Spread across trades, services, health, education, transport and desk work rather than weighted to
 * office roles, because a persona list that is 80% knowledge work quietly tells every brand its
 * customers are knowledge workers.
 */
export const OCCUPATIONS = [
  'Electrician', 'Plumber', 'Carpenter', 'Contractor', 'Mechanic', 'Welder', 'HVAC technician',
  'Landscaper', 'Construction manager', 'Truck driver', 'Delivery driver', 'Warehouse worker',
  'Farmer', 'Groundskeeper', 'Cleaner',
  'Nurse', 'Doctor', 'Dentist', 'Pharmacist', 'Physical therapist', 'Paramedic', 'Care worker',
  'Practice manager', 'Veterinarian', 'Optician',
  'Teacher', 'Professor', 'School administrator', 'Coach',
  'Police officer', 'Firefighter', 'Military service member',
  'Chef', 'Restaurant owner', 'Bartender', 'Barista', 'Retail manager', 'Salon owner',
  'Hairdresser', 'Barber', 'Personal trainer', 'Childminder',
  'Accountant', 'Lawyer', 'Financial advisor', 'Insurance agent', 'Real estate agent',
  'Small business owner', 'Founder', 'Consultant', 'Freelancer',
  'Software engineer', 'IT administrator', 'Security analyst', 'Designer', 'Product manager',
  'Marketer', 'Salesperson', 'Recruiter',
  'Operations manager', 'Project manager', 'Analyst', 'Executive assistant', 'Office manager',
  'Journalist', 'Photographer', 'Artist', 'Musician',
  'Student', 'Retired', 'Stay-at-home parent', 'Between jobs',
]

/**
 * HOBBIES AND INTERESTS, as tags.
 *
 * The field a persona is most often judged on by whoever reads the card, and the one most likely to
 * be typed four different ways ("fishing", "Fishing", "loves to fish", "goes fishing weekends") if
 * it is left as free text. Tags make two personas comparable at a glance.
 */
export const HOBBIES = [
  'Fishing', 'Hunting', 'Boating', 'Camping', 'Hiking', 'Climbing', 'Skiing', 'Surfing', 'Cycling',
  'Running', 'Swimming', 'Golf', 'Tennis', 'Yoga', 'Weight training', 'Martial arts',
  'Watching football', 'Watching basketball', 'Watching baseball', 'Watching soccer', 'Motorsport',
  'Coaching kids sports', 'Youth sports parent',
  'Cooking', 'Baking', 'Barbecue', 'Wine', 'Craft beer', 'Coffee', 'Eating out',
  'Gardening', 'Home improvement', 'Woodworking', 'Cars', 'Motorcycles', 'Model building',
  'Photography', 'Painting', 'Drawing', 'Music', 'Playing an instrument', 'Live music', 'Podcasts',
  'Film', 'Documentaries', 'Theatre', 'Museums and galleries',
  'Fashion', 'Skincare and beauty', 'Interiors',
  'Reading', 'Writing', 'Board games', 'Video games', 'Tabletop RPGs', 'Puzzles',
  'Travel', 'Road trips', 'Birdwatching', 'Astronomy', 'Volunteering', 'Church', 'Investing',
  'Dogs', 'Cats', 'Horses', 'Time with family', 'Time with friends',
]

/**
 * Common objections, as a starting vocabulary. The sibling of PAIN_LIBRARY and GOAL_LIBRARY, and
 * the one that was missing — which is why "Beat this objection" was the last field on an audience
 * card with nothing to pick from.
 *
 * Phrased as the buyer's own thought rather than as a category ("we already use something else",
 * not "incumbent"), because the writer is answering the thought and a category tells it nothing
 * about the words to use. Deliberately generic: a brand's real objections belong on its audience
 * records, and these exist to be replaced by them.
 */
export const OBJECTION_GROUPS: VocabGroup[] = [
  {
    label: 'Selling to people',
    options: [
      'it costs too much',
      'I can do this myself',
      'I have not got time to learn it',
      'I have been burned by one of these before',
      'what I use now is good enough',
      'I do not want another subscription',
      'it looks like it is built for professionals',
      'I cannot tell if it will suit me',
      'I do not want the hassle if it is wrong',
    ],
  },
  {
    label: 'Selling to businesses',
    options: [
      'we already have someone who does this',
      'switching would take too long',
      'not convinced it would actually work',
      'not a priority right now',
      'it looks complicated to set up',
      'someone else has to approve it',
      'we can do this ourselves',
      'we cannot afford it this year',
      'our people would not use it',
    ],
  },
  {
    label: 'Supporters, members and audiences',
    options: [
      'I gave already',
      'I do not know where the money actually goes',
      'someone bigger should be handling this',
      'I have not got time to get involved',
      'it is not really my thing',
    ],
  },
]

export const OBJECTION_LIBRARY = OBJECTION_GROUPS.flatMap((g) => g.options)

export const TRIGGER_GROUPS: VocabGroup[] = [
  {
    label: 'Selling to people',
    options: [
      'what they own broke or wore out',
      'a date they are preparing for',
      'the season changed',
      'a birthday, anniversary or holiday',
      'they just moved',
      'a subscription or contract is about to lapse',
      'a change at home: a baby, a pet, a new hobby',
      'someone they trust recommended it',
      'money landed: a refund, a bonus, a payday',
      'the price of what they use went up',
      'a bad experience with what they use now',
      'they have started looking around',
      'they are about to run out',
      'a sale or a deadline is closing',
    ],
  },
  {
    label: 'Selling to businesses',
    options: [
      'a busy season is coming',
      'they just took on staff',
      'they opened somewhere new',
      'their supplier or provider let them down',
      'a new rule they have to meet',
      'the budget year turned over',
      'they are quoting for something bigger than usual',
      'someone senior joined or left',
      'they are actively comparing options',
      'a contract is up for renewal',
    ],
  },
  {
    label: 'Supporters, members and audiences',
    options: [
      'giving season',
      'a campaign deadline',
      'a matching gift is on the table',
      'something in the news about the issue',
      'they just attended or watched something',
      'their membership is up for renewal',
      'a grant cycle or an annual report',
    ],
  },
]

export const BUYING_TRIGGERS = TRIGGER_GROUPS.flatMap((g) => g.options)
