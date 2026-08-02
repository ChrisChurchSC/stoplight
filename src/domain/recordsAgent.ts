/**
 * The records-page AI agent — the flow-canvas assistant, brought to the Records tables.
 * The chat sends a snapshot of the record type in view (its fields + the current rows for
 * the brand) plus the user's message; the model replies AND returns structured commands the
 * client applies through the same add/update/delete the table uses. The command layer is
 * deterministic and validated, so the model only decides intent — it never touches the store
 * directly. The offline heuristic answers with advice and no edits. Mirrors domain/flowAgent.ts.
 */

/** A record is matched by its name (case-insensitive: exact wins, else contains). */
export type RecordCommand =
  | { op: 'add'; fields: Record<string, string> }
  | { op: 'update'; match: string; set: Record<string, string> }
  | { op: 'delete'; match: string }
  | { op: 'bulkSet'; where: { field: string; equals?: string; empty?: boolean } | null; set: Record<string, string> }

export interface RecordFieldSpec {
  key: string
  label: string
  kind: string
  /** For status / ref fields: the allowed values. */
  options?: string[]
}

export interface RecordAgentContext {
  /** The record type in view, e.g. "Companies". */
  recordType: string
  /** Singular noun, e.g. "company". */
  noun: string
  brand: string
  /** 'build' allows edit commands; 'analyze' is read-only Q&A (no commands). */
  intent: 'build' | 'analyze'
  /** The editable fields on this record type (keys the agent may set). */
  fields: RecordFieldSpec[]
  /** The current rows for the brand, as flat field maps (name + values), so the agent can
   *  reference and update real records. */
  records: Record<string, string>[]
  message: string
  /** Prior turns for continuity (most recent last). */
  history: { role: 'user' | 'assistant'; text: string }[]
}

export interface RecordAgentResult {
  reply: string
  commands: RecordCommand[]
}

/** One message in a records chat. Assistant messages may carry pending suggestions. */
export interface RecordChatMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
  live?: boolean
  commands?: RecordCommand[]
  suggestions?: string[]
  resolved?: 'applied' | 'discarded'
}

/** A short, human-readable description of a command, for the Apply/Discard suggestion list. */
export function describeRecordCommand(cmd: RecordCommand, noun: string): string {
  switch (cmd.op) {
    case 'add': {
      const name = cmd.fields.name || `New ${noun}`
      const extras = Object.entries(cmd.fields)
        .filter(([k, v]) => k !== 'name' && v)
        .slice(0, 3)
        .map(([, v]) => v)
      return `Add ${noun} “${name}”${extras.length ? ` · ${extras.join(', ')}` : ''}`
    }
    case 'update': {
      const sets = Object.entries(cmd.set).map(([k, v]) => `${k} → ${v}`).join(', ')
      return `Update “${cmd.match}”: ${sets}`
    }
    case 'delete':
      return `Delete “${cmd.match}”`
    case 'bulkSet': {
      const sets = Object.entries(cmd.set).map(([k, v]) => `${k} → ${v}`).join(', ')
      const where = cmd.where
        ? cmd.where.empty
          ? `where ${cmd.where.field} is empty`
          : `where ${cmd.where.field} = ${cmd.where.equals ?? ''}`
        : 'for all'
      return `Set ${sets} ${where}`
    }
  }
}

/**
 * Offline answer: no edits, just guidance grounded in the record snapshot. Runs when the
 * server has no API key, so the panel still responds (it just can't act).
 */
export function heuristicRecordsAgent(ctx: RecordAgentContext): RecordAgentResult {
  const n = ctx.records.length
  const plural = ctx.noun.endsWith('y') ? `${ctx.noun.slice(0, -1)}ies` : `${ctx.noun}s`
  const bits: string[] = []
  bits.push(`**${ctx.recordType}** has ${n} ${n === 1 ? ctx.noun : plural}${ctx.brand ? ` for ${ctx.brand}` : ''}.`)
  bits.push(
    'Connect Claude (set an API key) and I can add, edit, and clean up records from here — e.g. "add a competitor company", "set every lead\'s owner to Chris", or "which rows are missing a country?".',
  )
  return { reply: bits.join('\n\n'), commands: [] }
}

/** Normalize a name for matching (trim + lowercase). */
const norm = (s: string) => (s ?? '').trim().toLowerCase()

/** Find the row ids a command targets, by name (exact, else contains). Rows are field maps
 *  that include `__id`. */
export function matchRowIds(match: string, rows: (Record<string, string> & { __id: string })[]): string[] {
  const m = norm(match)
  if (!m) return []
  const exact = rows.filter((r) => norm(r.name) === m)
  if (exact.length) return exact.map((r) => r.__id)
  return rows.filter((r) => norm(r.name).includes(m)).map((r) => r.__id)
}
