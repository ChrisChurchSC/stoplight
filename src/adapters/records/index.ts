import { isSupabaseConfigured } from '../../lib/supabase'
import { MockRecordAdapter } from './mockRecordAdapter'
import { SupabaseRecordAdapter } from './supabaseRecordAdapter'
import type { RecordAdapter } from './types'

export type { RecordAdapter } from './types'

/**
 * One record list's persistence: a Supabase table when a backend is configured, else localStorage.
 * `storageKey` is the localStorage array key (unchanged from before); `table` is the Supabase table.
 */
export function makeRecordAdapter<T extends { id: string; name?: string }>(
  storageKey: string,
  table: string,
): RecordAdapter<T> {
  return isSupabaseConfigured ? new SupabaseRecordAdapter<T>(table) : new MockRecordAdapter<T>(storageKey)
}
