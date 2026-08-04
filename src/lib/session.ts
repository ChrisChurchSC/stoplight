import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Session + workspace resolution for the Supabase backend. Only meaningful when
 * Supabase is configured; otherwise the app runs unauthenticated on localStorage.
 *
 * On first sign-in a user has no workspace, so getActiveWorkspaceId() creates one
 * and adds the user as its owner. The resolved id is cached and is what the
 * data adapters scope every read/write to.
 */

let workspaceId: string | null = null
const ACTIVE_WS_KEY = 'stoplight.activeWorkspace.v1'

/** Pin the active workspace (used after claiming an invite so the shared workspace sticks). */
export function setActiveWorkspaceId(id: string): void {
  workspaceId = id
  try {
    localStorage.setItem(ACTIVE_WS_KEY, id)
  } catch {
    /* ignore */
  }
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

/**
 * The signed-in user's first name for greetings: a metadata full name if set, else the email's
 * local part, tidied ("chris.church@…" → "Chris"). Empty when signed out / no backend configured.
 */
export function firstNameOf(user: User | null): string {
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string }
  const full = (meta.full_name || meta.name || '').trim()
  if (full) return full.split(/\s+/)[0]
  const local = (user?.email || '').split('@')[0].split(/[.+_-]/)[0]
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : ''
}

/**
 * The event is passed through as well as the user, because PASSWORD_RECOVERY is the only way to
 * know a session arrived from a reset link rather than a sign-in. Following that link DOES create
 * a real session, so without the event a gate keyed on "is there a user" would send someone
 * straight into the app — past the password field they came to use.
 */
export function onAuthChange(cb: (user: User | null, event: AuthChangeEvent) => void): () => void {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    workspaceId = null // re-resolve per user
    cb(session?.user ?? null, event)
  })
  return () => data.subscription.unsubscribe()
}

/**
 * Send the "set a new password" link. redirectTo has to be listed in the Supabase project's
 * allowed redirect URLs or the link bounces to the site root with no token on it.
 *
 * Errors are swallowed on purpose at the call site, not here: whether an address has an account is
 * not something a signed-out form should be willing to reveal.
 */
export async function sendPasswordReset(email: string): Promise<string | null> {
  if (!supabase) return 'Backend not configured'
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`,
  })
  return error?.message ?? null
}

/** Set a new password for whoever the current session belongs to (the recovery session). */
export async function updatePassword(password: string): Promise<string | null> {
  if (!supabase) return 'Backend not configured'
  const { error } = await supabase.auth.updateUser({ password })
  return error?.message ?? null
}

export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Backend not configured'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error?.message ?? null
}

/** What sign-up knows about the person, beyond the two fields Supabase Auth stores itself. */
export interface SignUpProfile {
  fullName: string
  firstName: string
  lastName: string
  /** Names the workspace created on first sign-in — see resolveWorkspaceId below. */
  company: string
}

export interface SignUpResult {
  error: string | null
  /**
   * The account was created but no session came back, which is Supabase telling us email
   * confirmation is switched on. The caller has to say so, because otherwise a successful sign-up
   * looks like nothing happened: no error, no error message, and the same form still on screen.
   */
  needsConfirmation: boolean
}

export async function signUpWithPassword(
  email: string,
  password: string,
  profile?: SignUpProfile,
): Promise<SignUpResult> {
  if (!supabase) return { error: 'Backend not configured', needsConfirmation: false }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Stored on the account itself, so it survives a new device in a way the localStorage
      // profile does not. firstNameOf() reads full_name for greetings; resolveWorkspaceId()
      // reads company to name the workspace.
      data: profile
        ? {
            full_name: profile.fullName,
            first_name: profile.firstName,
            last_name: profile.lastName,
            company: profile.company,
          }
        : undefined,
      // Where the confirmation link lands. Without this Supabase uses the project's Site URL,
      // which is one fixed origin and so sends previews and localhost to production.
      emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  })
  if (error) return { error: error.message, needsConfirmation: false }
  return { error: null, needsConfirmation: !data.session }
}

export async function signOut(): Promise<void> {
  workspaceId = null
  await supabase?.auth.signOut()
}

// Concurrent first-call resolution is deduped: refresh(), hydrateRecords() and migration all call
// getActiveWorkspaceId() at once on sign-in, and without this each would create its own workspace.
let resolving: Promise<string | null> | null = null

/** The signed-in user's workspace, created on first use. Cached for the session. */
export async function getActiveWorkspaceId(): Promise<string | null> {
  if (!supabase) return null
  if (workspaceId) return workspaceId
  if (resolving) return resolving
  resolving = resolveWorkspaceId()
  try {
    return await resolving
  } finally {
    resolving = null
  }
}

async function resolveWorkspaceId(): Promise<string | null> {
  if (!supabase) return null
  if (workspaceId) return workspaceId

  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return null

  // Already a member of one or more workspaces? Prefer the pinned active one (e.g. a workspace the
  // user was invited into), else the first membership.
  const { data: memberships, error: memErr } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
  // A FAILED lookup is not the same as "no memberships yet", and reading it as one is how a person
  // ends up with a brand-new workspace every time the network hiccups on load. Give up for now —
  // the next call re-resolves — rather than creating a second home for their work.
  if (memErr) return null
  const ids = (memberships ?? []).map((m) => m.workspace_id as string)
  if (ids.length > 0) {
    let pinned: string | null = null
    try {
      pinned = localStorage.getItem(ACTIVE_WS_KEY)
    } catch {
      /* ignore */
    }
    workspaceId = pinned && ids.includes(pinned) ? pinned : ids[0]
    return workspaceId
  }

  // First sign-in: create a workspace and join it as owner. Sign-up asks for a company and puts it
  // in user_metadata, so prefer that — "Initech" beats "chris's workspace" for a team, and this is
  // the one moment the workspace gets named. Accounts made before that question existed, and any
  // created outside the sign-up page, still fall back to the email's local part.
  const meta = (user.user_metadata ?? {}) as { company?: string }
  const company = (meta.company ?? '').trim()
  const name = company || (user.email ?? 'My workspace').split('@')[0] + "'s workspace"

  // Before creating anything, look for a workspace this user already created. If an earlier run
  // made one but failed to add the membership row, this finds it and finishes the job — instead of
  // minting a fresh orphan on every single load, none of which the user can read or write.
  // (workspaces_select permits created_by = auth.uid() precisely so this lookup works.)
  const { data: mine } = await supabase
    .from('workspaces')
    .select('id')
    .eq('created_by', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
  let id = (mine?.[0] as { id?: string } | undefined)?.id

  if (!id) {
    const { data: ws, error: wsErr } = await supabase
      .from('workspaces')
      .insert({ name, created_by: user.id })
      .select('id')
      .single()
    if (wsErr || !ws) return null
    id = ws.id as string
  }

  // The membership row is what every RLS policy actually checks — is_member/is_editor read
  // workspace_members, not workspaces.created_by. Without it you own a workspace you can neither
  // read nor write, and since every failure downstream is a silent empty result, the app would
  // present that as an account that simply has nothing saved in it. So this error ends the resolve
  // instead of being discarded. A duplicate is not a failure: the row already being there is the
  // outcome we wanted.
  const { error: joinErr } = await supabase
    .from('workspace_members')
    .insert({ workspace_id: id, user_id: user.id, role: 'owner' })
  if (joinErr && joinErr.code !== '23505') return null

  workspaceId = id
  return workspaceId
}

/** Create a shareable invite to the active workspace; returns the token (embed in a ?invite= link). */
export async function createInvite(role: 'owner' | 'editor' | 'stakeholder' = 'editor'): Promise<string | null> {
  if (!supabase) return null
  const ws = await getActiveWorkspaceId()
  if (!ws) return null
  const { data: u } = await supabase.auth.getUser()
  const token = (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) + Math.random().toString(36).slice(2)
  const { error } = await supabase
    .from('workspace_invites')
    .insert({ token, workspace_id: ws, role, created_by: u.user?.id ?? null })
  return error ? null : token
}

/** Redeem an invite token: join the workspace and pin it as active. */
export async function claimInvite(token: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Backend not configured' }
  const { data, error } = await supabase.rpc('claim_invite', { invite_token: token })
  if (error) return { ok: false, error: error.message }
  if (typeof data === 'string') setActiveWorkspaceId(data)
  return { ok: true }
}
