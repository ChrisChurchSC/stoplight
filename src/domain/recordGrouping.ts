/**
 * Per-sheet "group by" preference for the records tables. Each sheet (keyed by its title:
 * "Companies", "People", …) remembers which field it's grouped by, so the choice survives a
 * reload. A pure UI preference, so it lives in its own localStorage map rather than the data
 * store — small, self-contained, and independent of the record contents.
 */
const KEY = 'stoplight.recordGrouping.v1'

type GroupingMap = Record<string, string>

const readAll = (): GroupingMap => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as GroupingMap) : {}
  } catch {
    return {}
  }
}

/** The saved group field for one sheet, or null if it's ungrouped / never set. */
export const loadRecordGrouping = (sheet: string): string | null => readAll()[sheet] ?? null

/** Remember (or clear, when field is null) the group field for one sheet. */
export const saveRecordGrouping = (sheet: string, field: string | null): void => {
  try {
    const all = readAll()
    if (field) all[sheet] = field
    else delete all[sheet]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // storage unavailable (private mode / quota) — grouping just won't persist this session
  }
}
