import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The Supabase client, created only when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 * are set. When they aren't, `supabase` is null and the app stays on the mock
 * localStorage adapters — so adding a backend is additive and nothing breaks until
 * you provision a project and run supabase/schema.sql.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = !!(url && anon)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anon as string)
  : null
