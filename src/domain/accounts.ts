/**
 * Target Accounts — the core of account-based marketing (ABM). A campaign can target a
 * named list of accounts (BlackRock, Robinhood, …) instead of, or alongside, broad
 * audiences. Accounts live under a brand (scoped like everything else), group into
 * target lists, and become a fan-out dimension so generation can produce per-account
 * 1:1 variants keyed to each account's real situation.
 *
 * This is the data foundation. Program/phasing (dates, owners, KPIs) and the
 * account-centric metrics dashboard build on top of it.
 */

/** How tightly the program personalizes to the account. */
export type AccountTier = '1:1' | '1:few' | '1:many'
export const ACCOUNT_TIERS: AccountTier[] = ['1:1', '1:few', '1:many']

/** Where the account sits in the lead-gen funnel — the ABM pipeline, not the asset funnel. */
export type AccountStatus = 'target' | 'engaged' | 'meeting' | 'pipeline' | 'won' | 'lost'
export const ACCOUNT_STATUSES: AccountStatus[] = ['target', 'engaged', 'meeting', 'pipeline', 'won', 'lost']
/** Pipeline order (won/lost are terminal); drives the dashboard's column order. */
export const accountStatusRank = (s: AccountStatus): number => ACCOUNT_STATUSES.indexOf(s)

/** A member of the account's buying committee — a role to speak to and the concern they
 *  weigh (e.g. Compliance → "regulatory exposure"). Drives committee-aware copy. */
export interface CommitteeMember {
  role: string
  concern?: string
}

export interface Account {
  id: string
  /** The account's brand owner (scoping key — accounts live under a brand). */
  brand: string
  name: string
  domain?: string
  /** Industry / segment, e.g. "Asset management", "Retail brokerage". */
  segment?: string
  tier: AccountTier
  status: AccountStatus
  /** The account's real, public situation — onchain ambitions, mandate, recent moves.
   *  This is what makes a 1:1 variant differ materially (not just a name swap). */
  notes?: string
  /** The buying committee: roles + concerns to address. */
  committee?: CommitteeMember[]
}

/** A named set of accounts a campaign/program targets. */
export interface TargetList {
  id: string
  brand: string
  name: string
  accountIds: string[]
}

let accountSeq = 0
export function newAccount(brand: string, patch: Partial<Account> = {}): Account {
  accountSeq += 1
  return {
    id: patch.id ?? `acct_${Date.now().toString(36)}_${accountSeq}`,
    brand,
    name: patch.name ?? 'New account',
    domain: patch.domain,
    segment: patch.segment,
    tier: patch.tier ?? '1:few',
    status: patch.status ?? 'target',
    notes: patch.notes,
    committee: patch.committee,
  }
}

let listSeq = 0
export function newTargetList(brand: string, name: string, accountIds: string[] = []): TargetList {
  listSeq += 1
  return { id: `tlist_${Date.now().toString(36)}_${listSeq}`, brand, name: name.trim() || 'Target list', accountIds }
}

/**
 * The personalization context an account contributes to generation, so a per-account
 * variant reads in terms of the account's real situation (segment, ambition, the lead
 * committee concern) — not a name swapped into a generic template. Woven into copy the
 * same way location/time context is, so a BlackRock variant and a Robinhood variant
 * diverge on substance.
 */
export function accountContext(a: Account): Record<string, string> {
  const ctx: Record<string, string> = { account: a.name }
  if (a.segment) ctx.segment = a.segment
  // The account's situation, trimmed to a lead clause so it reads as a hook, not a dump.
  const situation = (a.notes ?? '').split(/[.;\n]/)[0].trim()
  if (situation) ctx.situation = situation
  // The top committee concern — what this account weighs most.
  const concern = a.committee?.find((m) => m.concern)?.concern?.trim()
  if (concern) ctx.concern = concern
  return ctx
}
