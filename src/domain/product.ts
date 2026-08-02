import { freshRecordId } from './records'

/**
 * A PRODUCT: one thing the brand actually sells.
 *
 * The brand profile already holds `products` as a list of names, which is enough to tell a copy
 * writer what the company offers and nothing more. It cannot say who a product is for, what it
 * replaces, what it costs, or what it is called in the room — and those are exactly the facts that
 * decide how a piece of copy about it reads.
 *
 * Kept apart from Company on purpose. A Company record is an ACCOUNT: someone you sell to, or a
 * competitor. A Product is what you sell. Folding them together is how "customers" and "catalogue"
 * end up in one table with a type column and every read has to filter.
 */
export interface Product {
  id: string
  /** Which brand's workspace this belongs to. Untagged = shows for all. */
  brand?: string
  name: string
  /** One line: what it is, for someone who has not heard of it. */
  summary?: string
  /** What kind of thing it is, so the writer knows the shape of the sale. */
  kind?: string
  /** Who it is for, in the brand's own words. Joins loosely to an audience by name. */
  forWho?: string
  /** The one job it does better than the alternative. The reason to buy THIS one. */
  jobToBeDone?: string
  /** What people use instead today. Displacement is most of what copy has to argue. */
  replaces?: string
  /** The page that sells it. Also the input for filling this card in from it. */
  website?: string
  /** How it is paid for, as a band rather than a figure: a price in a record goes stale silently. */
  pricing?: string
  /** Where it is in its life, which sets how much explaining the copy has to do. */
  stage?: string
  status?: 'active' | 'sunset' | 'concept' | ''
  notes?: string
}

/** What kind of thing is being sold. Sets the shape of the sale more than the category does. */
export const PRODUCT_KINDS = [
  'Subscription',
  'One-off purchase',
  'Service',
  'Retainer',
  'Course or programme',
  'Event',
  'Membership',
  'Free tool',
  'Marketplace',
  'Donation or appeal',
] as const

/** How it is paid for. Bands, not figures: a price typed into a record goes stale in silence. */
export const PRODUCT_PRICING = [
  'Free',
  'Freemium',
  'Under $25',
  '$25 to $100',
  '$100 to $500',
  '$500 to $5,000',
  'Over $5,000',
  'Quote only',
] as const

/** Where it is in its life. Decides how much the copy has to explain before it can persuade. */
export const PRODUCT_STAGES = [
  'Not launched yet',
  'Just launched',
  'Growing',
  'Established',
  'Being replaced',
] as const

export const PRODUCT_STATUSES: NonNullable<Product['status']>[] = ['active', 'sunset', 'concept']

export function freshProductId(): string {
  return freshRecordId('prd')
}
