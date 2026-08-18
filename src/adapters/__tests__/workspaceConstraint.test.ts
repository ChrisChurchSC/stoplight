import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE ONE-WORKSPACE-PER-ACCOUNT CONSTRAINT HAS TO REACH BOTH KINDS OF PROJECT.
 *
 * A fresh project is built from schema.sql alone and never runs a migration. An existing project
 * runs migrations and never re-runs schema.sql. So a constraint written into only one of them
 * protects only half the world, and the half it misses is the half that already has the bug.
 *
 * This is the constraint that stops first sign-in minting several workspaces for one account. It
 * matters more than most: the failure is silent. The app opens whichever workspace resolves first
 * and simply does not show the other, so a month of work sat invisible on this project before
 * anyone counted rows. Every guard in `resolveWorkspaceId` is check-then-act and concurrent
 * sessions all pass their check, which is why the answer had to move into the database.
 *
 * A text comparison on purpose, like schemaCoverage.test.ts beside it: no database, so it runs in
 * CI on every change and fails the moment someone rewrites the workspaces table without it.
 */

const root = join(__dirname, '..', '..', '..')
const INDEX = 'workspaces_one_per_creator'

const schema = readFileSync(join(root, 'supabase/schema.sql'), 'utf8')
const migrations = readdirSync(join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8'))
  .join('\n')

/** Collapsed whitespace, so the assertions do not depend on how the SQL happens to be wrapped. */
const flat = (sql: string) => sql.replace(/\s+/g, ' ').toLowerCase()

describe('one workspace per creator', () => {
  it('is created for a fresh project, by schema.sql', () => {
    expect(flat(schema)).toContain(`create unique index if not exists ${INDEX}`)
  })

  it('is created for an existing project, by a migration', () => {
    expect(flat(migrations)).toContain(`create unique index if not exists ${INDEX}`)
  })

  /**
   * Partial, and the predicate is not decoration. created_by references auth.users with
   * `on delete set null`, so deleting an account leaves its workspaces behind with a null creator.
   * Postgres treats nulls as distinct in a unique index, so a plain index would happen to allow
   * them — but only by accident. Saying `where created_by is not null` makes it intentional, and
   * keeps the index off rows nothing will ever look up by creator.
   */
  it('is partial, so orphaned workspaces from deleted accounts stay legal', () => {
    for (const sql of [schema, migrations]) {
      const idx = flat(sql).indexOf(`create unique index if not exists ${INDEX}`)
      expect(idx).toBeGreaterThan(-1)
      expect(flat(sql).slice(idx, idx + 200)).toContain('where created_by is not null')
    }
  })

  it('indexes created_by on the workspaces table', () => {
    const idx = flat(schema).indexOf(`create unique index if not exists ${INDEX}`)
    expect(flat(schema).slice(idx, idx + 200)).toContain('on public.workspaces (created_by)')
  })
})

/**
 * The other half of the fix. A constraint alone turns a silent duplicate into a hard failure for
 * whoever loses the race, which is not obviously better — it trades invisible data loss for a
 * user who cannot sign in. resolveWorkspaceId has to read the violation as "someone else got
 * there first" and adopt their workspace.
 */
describe('resolveWorkspaceId handles losing the race', () => {
  const session = readFileSync(join(root, 'src/lib/session.ts'), 'utf8')

  it('recognises the unique violation rather than returning null', () => {
    expect(session).toContain("wsErr?.code === '23505'")
  })

  it('adopts the winning workspace instead of creating another', () => {
    const at = session.indexOf("wsErr?.code === '23505'")
    expect(at).toBeGreaterThan(-1)
    const branch = session.slice(at, at + 600)
    expect(branch).toContain(".eq('created_by', user.id)")
    expect(branch).not.toContain('.insert(')
  })
})
