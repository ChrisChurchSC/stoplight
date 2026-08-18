/**
 * Naming the workspace when the account did not come from the sign-up form.
 *
 * The sign-up form asks for a company and `resolveWorkspaceId()` uses it, so an email account
 * names its workspace at the moment it is created. Google gives us a name, an email and an avatar
 * — never an employer — so a Google account would fall through to the email local part and be
 * called "chris's workspace". That fallback exists for accounts made before the question was
 * asked, and it is the wrong outcome for a brand new one: nothing in the app can rename a
 * workspace (`workspaces` is written in exactly one file, `lib/session.ts`), so whatever it is
 * called on the first sign-in is what a team is stuck reading forever.
 *
 * So the gate asks, once, before the workspace exists. These are the rules behind that screen,
 * kept pure so they can be tested without an OAuth round trip.
 */

/** Our own floor. Supabase has no opinion about workspace names; a blank one is still useless. */
export const MAX_WORKSPACE_NAME = 60

/**
 * Whether the "what is your company called?" step is owed to this person.
 *
 * Both halves matter. `hasCompany` is false for every OAuth account and true for every account
 * that answered the sign-up form. `hasWorkspace` is the guard against asking someone who already
 * has somewhere to work — an invited teammate, or anyone signing in for the second time — because
 * for them the question is not just redundant, it is unanswerable: their workspace is already
 * named and this screen could not change it.
 */
export function needsWorkspaceName(opts: { hasCompany: boolean; hasWorkspace: boolean }): boolean {
  return !opts.hasCompany && !opts.hasWorkspace
}

/** Domains that say nothing about where somebody works, so a guess from one would be nonsense. */
const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'fastmail.com',
  'hey.com',
  'duck.com',
])

/**
 * Suffixes that are plumbing rather than part of a name. Anything not listed is kept, because the
 * word TLDs are usually the point — "super-conscious.studio" is Super Conscious Studio, and an
 * agency on .agency or .design did not choose that by accident.
 */
const GENERIC_SUFFIXES = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'int', 'info', 'biz', 'name',
  'io', 'co', 'ai', 'app', 'dev', 'xyz', 'online', 'site', 'website',
  'cloud', 'tech', 'digital', 'email', 'link', 'live', 'world',
  // ccTLDs common enough to be noise in a company name.
  'uk', 'us', 'ca', 'au', 'nz', 'ie', 'de', 'fr', 'es', 'it', 'nl', 'se', 'no', 'dk', 'fi',
  'jp', 'cn', 'in', 'br', 'mx', 'za', 'eu',
])

/** "super-conscious" → "Super Conscious". Hyphens and underscores are word breaks, not letters. */
function titleCase(label: string): string {
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * A starting guess for the field, from the email's domain — NOT a silent default.
 *
 * This is the whole reason the guess is allowed to be imperfect: it lands in an editable box in
 * front of the person it describes, who fixes it in the two seconds it takes to read. The same
 * heuristic used silently would be a liability, since "Foo Bar Consulting Ltd" trading on
 * foobar.io is not something a domain can tell us.
 *
 * Returns '' when there is nothing worth guessing from — a consumer mailbox, or a bare domain —
 * and an empty box is the honest version of that.
 */
export function suggestCompanyFromEmail(email: string): string {
  const domain = (email || '').trim().toLowerCase().split('@')[1]
  if (!domain) return ''
  const clean = domain.replace(/^www\./, '')
  if (CONSUMER_DOMAINS.has(clean)) return ''

  const labels = clean.split('.').filter(Boolean)
  if (labels.length < 2) return ''

  // Trailing plumbing comes off; "foo.co.uk" loses both halves of its suffix, "acme.studio" loses
  // neither, and a name is never emptied entirely by this (foo.com keeps "foo").
  const kept = [...labels]
  while (kept.length > 1 && GENERIC_SUFFIXES.has(kept[kept.length - 1])) kept.pop()

  const name = kept.map(titleCase).filter(Boolean).join(' ').trim()
  return name.slice(0, MAX_WORKSPACE_NAME)
}

/** The one rule the field enforces. Everything else is the person's business. */
export function validateWorkspaceName(name: string): string | null {
  const trimmed = (name || '').trim()
  if (!trimmed) return 'A company or team name — it names your workspace.'
  if (trimmed.length > MAX_WORKSPACE_NAME) return `Keep it under ${MAX_WORKSPACE_NAME} characters.`
  return null
}

export function isWorkspaceNameValid(name: string): boolean {
  return validateWorkspaceName(name) === null
}
