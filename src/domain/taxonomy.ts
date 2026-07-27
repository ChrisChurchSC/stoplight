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
]

export const PAIN_LIBRARY = [
  'manual workflows',
  'slow tools',
  'fragmented stack',
  'busywork',
  'lack of visibility',
  'high costs',
  'compliance risk',
  'scaling pains',
  'slow time-to-value',
  'integration gaps',
  'data silos',
  'customer churn',
  'wasted ad spend',
  'team burnout',
  'manual reporting',
]

export const GOAL_LIBRARY = [
  'save time',
  'cut costs',
  'grow revenue',
  'improve efficiency',
  'scale the team',
  'reduce risk',
  'faster time-to-value',
  'better visibility',
  'consolidate tools',
  'improve retention',
  'win enterprise deals',
]

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
  'Farmer', 'Fisherman', 'Charter captain',
  'Nurse', 'Doctor', 'Dentist', 'Pharmacist', 'Physical therapist', 'Paramedic', 'Care worker',
  'Teacher', 'Professor', 'School administrator', 'Coach',
  'Police officer', 'Firefighter', 'Military service member',
  'Chef', 'Restaurant owner', 'Bartender', 'Barista', 'Retail manager', 'Salon owner',
  'Accountant', 'Lawyer', 'Financial advisor', 'Insurance agent', 'Real estate agent',
  'Small business owner', 'Founder', 'Consultant', 'Freelancer',
  'Software engineer', 'Designer', 'Product manager', 'Marketer', 'Salesperson', 'Recruiter',
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
export const OBJECTION_LIBRARY = [
  'it costs too much',
  'we already use something else',
  'switching would take too long',
  'not convinced it would actually work',
  'not a priority right now',
  'it looks complicated to set up',
  'the free option is good enough',
  'we tried something like this before',
  'someone else has to approve it',
  'we can do this ourselves',
]

export const BUYING_TRIGGERS = [
  'new funding round',
  'leadership change',
  'rapid headcount growth',
  'new regulation',
  'tool consolidation',
  'researching alternatives',
  'budget cycle / new fiscal year',
  'recent outage or failure',
  'M&A activity',
  'expanding to new markets',
]
