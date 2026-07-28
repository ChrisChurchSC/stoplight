import type { AggregateContribution } from '../../domain/aggregateOutcome'
import { getActiveWorkspaceId } from '../../lib/session'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

/**
 * The cross-customer pool: workspaces contribute anonymized (dimension × archetype × attribute →
 * outcome) rows keyed by an opaque contributor hash, and everyone reads back only FLOOR-GATED
 * aggregates (≥N distinct contributors) through a SECURITY DEFINER RPC that never returns raw rows
 * or the contributor. Degrades to no-op when Supabase / the table isn't there.
 */

/** A stable, non-reversible id for the contributing workspace (for distinct-customer counting). */
export async function contributorId(): Promise<string | null> {
  const ws = await getActiveWorkspaceId()
  if (!ws) return null
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`stoplight-aggregate:${ws}`))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
  } catch {
    return ws // fall back to the raw id (still opaque; the RPC never returns it)
  }
}

/** Upsert this workspace's anonymized contributions (one row per pattern). Fire-and-forget. */
export async function contribute(records: AggregateContribution[]): Promise<void> {
  if (!records.length || !isSupabaseConfigured || !supabase) return
  try {
    await supabase.from('aggregate_outcomes').upsert(
      records.map((r) => ({
        contributor: r.contributor,
        dimension: r.dimension,
        archetype: r.archetype,
        attribute: r.attribute,
        variants: r.variants,
        outcome: r.outcome,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'contributor,dimension,archetype,attribute' },
    )
  } catch {
    /* table not migrated yet, or offline — nothing to do */
  }
}

export interface PooledPattern {
  dimension: string
  archetype: string
  attribute: string
  customers: number
  variants: number
  outcome: number
}

/** Read floor-gated, anonymized patterns from the pool. Returns [] when unavailable. */
export async function readAggregatePatterns(minCustomers = 10): Promise<PooledPattern[]> {
  if (!isSupabaseConfigured || !supabase) return []
  try {
    const { data, error } = await supabase.rpc('aggregate_patterns', { min_customers: minCustomers })
    if (error || !Array.isArray(data)) return []
    return data.map((r) => ({
      dimension: r.dimension as string,
      archetype: r.archetype as string,
      attribute: r.attribute as string,
      customers: Number(r.customers) || 0,
      variants: Number(r.variants) || 0,
      outcome: Number(r.outcome) || 0,
    }))
  } catch {
    return []
  }
}
