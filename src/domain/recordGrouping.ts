import { persistState } from '../adapters/state/workspaceState'

/**
 * Per-sheet "group by" preference for the records tables. Each sheet (keyed by its title:
 * "Companies", "People", …) remembers which field it's grouped by, so the choice survives a
 * reload. A pure UI preference kept in its own map rather than the data store — but it saves
 * through persistState, so with a backend configured it mirrors to workspace_state and follows
 * the workspace across devices (hydrateRecords writes the workspace copy back to localStorage).
 */
export const RECORD_GROUPING_KEY = 'stoplight.recordGrouping.v1'

type GroupingMap = Record<string, string>

const readAll = (): GroupingMap => {
  try {
    const raw = localStorage.getItem(RECORD_GROUPING_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as GroupingMap) : {}
  } catch {
    return {}
  }
}

/** The saved group field for one sheet, or null if it's ungrouped / never set. */
export const loadRecordGrouping = (sheet: string): string | null => readAll()[sheet] ?? null

/** Remember (or clear, when field is null) the group field for one sheet. Writes localStorage
 *  always and mirrors to the workspace when a backend is configured. */
export const saveRecordGrouping = (sheet: string, field: string | null): void => {
  const all = readAll()
  if (field) all[sheet] = field
  else delete all[sheet]
  persistState(RECORD_GROUPING_KEY, all)
}
