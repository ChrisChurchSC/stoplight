import type { Session, User } from '@supabase/supabase-js'
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

export function onAuthChange(cb: (user: User | null) => void): () => void {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    workspaceId = null // re-resolve per user
    cb(session?.user ?? null)
  })
  return () => data.subscription.unsubscribe()
}

export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Backend not configured'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error?.message ?? null
}

export async function signUpWithPassword(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Backend not configured'
  const { error } = await supabase.auth.signUp({ email, password })
  return error?.message ?? null
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
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
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

  // First sign-in: create a workspace and join it as owner.
  const name = (user.email ?? 'My workspace').split('@')[0] + "'s workspace"
  const { data: ws, error: wsErr } = await supabase
    .from('workspaces')
    .insert({ name, created_by: user.id })
    .select('id')
    .single()
  if (wsErr || !ws) return null
  await supabase.from('workspace_members').insert({ workspace_id: ws.id, user_id: user.id, role: 'owner' })
  workspaceId = ws.id as string
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
