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
