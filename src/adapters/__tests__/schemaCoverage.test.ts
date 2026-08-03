import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The schema and the code that writes to it, checked against each other.
 *
 * This exists because they drifted and nothing noticed. `products`, `brand_objects` and
 * `library_folders` were in RECORD_TABLES — so every edit to those lists fired a mirror — but no
 * migration ever created them. postgrest-js resolves with an { error } object rather than throwing,
 * and saveRecordList discarded the promise, so the writes reported success and went nowhere for
 * months. `library_folders` was also READ on sign-in, where the missing table answered with an
 * empty list that got patched over folders the user had really created.
 *
 * A unit test catches that in a second, where a human reading two files side by side did not. It is
 * a text comparison on purpose: it needs no database, so it runs in CI on every change, which is
 * the only way it can be the thing that fails when someone adds a record kind and forgets the SQL.
 */

const root = join(__dirname, '..', '..', '..')
const store = readFileSync(join(root, 'src/store/useTrafficStore.ts'), 'utf8')

/** schema.sql plus every migration — a table counts as existing if either one creates it. */
function declaredTables(): Set<string> {
  const migrationsDir = join(root, 'supabase/migrations')
  const sql = [
    readFileSync(join(root, 'supabase/schema.sql'), 'utf8'),
    ...readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(migrationsDir, f), 'utf8')),
  ].join('\n')

  const tables = new Set<string>()
  // Plain `create table if not exists public.foo`.
  for (const m of sql.matchAll(/create table if not exists public\.([a-z_]+)/g)) tables.add(m[1])
  // The record tables are created in a loop over a name array, not one statement each.
  for (const loop of sql.matchAll(/foreach t in array array\[([\s\S]*?)\]/g)) {
    for (const name of loop[1].matchAll(/'([a-z_]+)'/g)) tables.add(name[1])
  }
  return tables
}

/** Every table saveRecordList() mirrors a record list to. */
function writtenTables(): string[] {
  const block = store.match(/const RECORD_TABLES[\s\S]*?\n\}/)
  expect(block, 'RECORD_TABLES map not found — did it move or get renamed?').toBeTruthy()
  return [...block![0].matchAll(/:\s*'([a-z_]+)',/g)].map((m) => m[1])
}

/** Every table hydrateRecords() reads back on sign-in. */
function hydratedTables(): string[] {
  return [...store.matchAll(/from<[A-Za-z]+>\('([a-z_]+)'\)/g)].map((m) => m[1])
}

describe('Supabase schema coverage', () => {
  it('finds the maps it reads, so a rename fails loudly instead of vacuously passing', () => {
    expect(writtenTables().length).toBeGreaterThan(10)
    expect(hydratedTables().length).toBeGreaterThan(10)
    expect(declaredTables().size).toBeGreaterThan(10)
  })

  it('creates every record table the app writes to', () => {
    const declared = declaredTables()
    expect(writtenTables().filter((t) => !declared.has(t))).toEqual([])
  })

  it('creates every record table the app reads on sign-in', () => {
    const declared = declaredTables()
    expect(hydratedTables().filter((t) => !declared.has(t))).toEqual([])
  })

  /**
   * The other half of the bug, and the more destructive one. A list that is written but never read
   * back initialises to [] on a device with a backend configured (see localDataMode), so the UI
   * shows nothing — and then the first edit calls replaceAll, which is a delete-then-insert, and
   * takes the workspace's real records with it. Concepts and seasons were losing data this way.
   */
  it('reads back every record table it writes, so an edit cannot replaceAll over an empty slice', () => {
    const hydrated = new Set(hydratedTables())
    expect(writtenTables().filter((t) => !hydrated.has(t))).toEqual([])
  })

  it('keeps the append-only history tables declared', () => {
    const declared = declaredTables()
    for (const t of ['audit_log', 'campaign_versions']) expect(declared.has(t)).toBe(true)
  })
})
