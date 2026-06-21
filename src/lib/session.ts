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

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
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

/** The signed-in user's workspace, created on first use. Cached for the session. */
export async function getActiveWorkspaceId(): Promise<string | null> {
  if (!supabase) return null
  if (workspaceId) return workspaceId

  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return null

  // Already a member of a workspace?
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
  if (memberships && memberships.length > 0) {
    workspaceId = memberships[0].workspace_id as string
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
