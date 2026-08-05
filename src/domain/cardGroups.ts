/**
 * Card groups on the canvas — a named set of cards that moves as one unit.
 *
 * Marquee-select a few cards, hit Group, and they stop being independently
 * placed cards the auto-layout can pull apart: the group pins every member's
 * position and drags them together, so an arrangement you built by hand (a
 * launch week, a test cell, a set of variants) stays exactly as you left it.
 *
 * Groups are a canvas-local, hand-placement concern — they live beside the
 * hand-nudged positions in localStorage, keyed by the same canvas key, not on
 * the rows themselves. Nothing here touches the strategy model: a group has no
 * bearing on a card's audience, stage, or journey links.
 */

export interface CardGroup {
  id: string
  /** Display name shown on the group's frame; renameable. */
  name: string
  /** Member card ids (message-node ids, which are row ids), in selection order. */
  ids: string[]
}

/** A group needs at least two cards — one card "grouped" with nothing is just a card. */
export const MIN_GROUP = 2

const GROUP_KEY = 'stoplight.cardGroups.v1'

export function loadCardGroups(canvasKey: string): CardGroup[] {
  try {
    const all = JSON.parse(localStorage.getItem(GROUP_KEY) || '{}')
    const list = all && all[canvasKey]
    return Array.isArray(list) ? list.filter(isGroup) : []
  } catch {
    return []
  }
}

export function saveCardGroups(canvasKey: string, groups: CardGroup[]): void {
  try {
    const all = JSON.parse(localStorage.getItem(GROUP_KEY) || '{}')
    if (groups.length) all[canvasKey] = groups
    else delete all[canvasKey]
    localStorage.setItem(GROUP_KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable — groups stay in-memory for the session */
  }
}

function isGroup(g: unknown): g is CardGroup {
  const x = g as CardGroup | null
  return !!x && typeof x.id === 'string' && Array.isArray(x.ids) && typeof x.name === 'string'
}

/** card id → the group it belongs to. A card is only ever in one group. */
export function groupIndex(groups: CardGroup[]): Map<string, CardGroup> {
  const out = new Map<string, CardGroup>()
  for (const g of groups) for (const id of g.ids) if (!out.has(id)) out.set(id, g)
  return out
}

/** Every card that moves when `id` moves: its whole group, or just itself. */
export function groupMates(groups: CardGroup[], id: string): string[] {
  const g = groupIndex(groups).get(id)
  return g ? g.ids : [id]
}

/** "Group 3" — the next free default name, so a new group never collides. */
export function nextGroupName(groups: CardGroup[]): string {
  const taken = new Set(groups.map((g) => g.name))
  for (let i = 1; ; i++) {
    const name = `Group ${i}`
    if (!taken.has(name)) return name
  }
}

/**
 * Group `ids` together. Cards already in another group leave it first (a card
 * belongs to exactly one group), and any group left below MIN_GROUP dissolves —
 * so pulling two of a three-card group into a new one leaves no orphan behind.
 * Returns the unchanged list when there aren't enough distinct cards to group.
 */
export function withGroup(groups: CardGroup[], ids: string[], name: string, id: string): { groups: CardGroup[]; group: CardGroup | null } {
  const members = [...new Set(ids)]
  if (members.length < MIN_GROUP) return { groups, group: null }
  const claimed = new Set(members)
  const kept = groups
    .map((g) => ({ ...g, ids: g.ids.filter((x) => !claimed.has(x)) }))
    .filter((g) => g.ids.length >= MIN_GROUP)
  const group: CardGroup = { id, name, ids: members }
  return { groups: [...kept, group], group }
}

/** Dissolve a group. The cards stay exactly where they are — only the tie is cut. */
export function withoutGroup(groups: CardGroup[], groupId: string): CardGroup[] {
  return groups.filter((g) => g.id !== groupId)
}

export function renameGroup(groups: CardGroup[], groupId: string, name: string): CardGroup[] {
  const trimmed = name.trim()
  if (!trimmed) return groups
  return groups.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g))
}

/**
 * Drop members whose card no longer exists (deleted from the board), and
 * dissolve any group that falls below MIN_GROUP as a result. Returns the same
 * array reference when nothing changed, so callers can skip a re-render.
 */
export function pruneGroups(groups: CardGroup[], liveIds: Set<string>): CardGroup[] {
  let dirty = false
  const next: CardGroup[] = []
  for (const g of groups) {
    const ids = g.ids.filter((id) => liveIds.has(id))
    if (ids.length !== g.ids.length) dirty = true
    if (ids.length >= MIN_GROUP) next.push(ids.length === g.ids.length ? g : { ...g, ids })
  }
  return dirty ? next : groups
}

/** True when `ids` is exactly the membership of `group` — i.e. the selection IS that group. */
export function isWholeGroup(group: CardGroup, ids: Set<string>): boolean {
  return ids.size === group.ids.length && group.ids.every((id) => ids.has(id))
}

/**
 * Expand a raw selection so groups select as units: touch one member of a group
 * and you've selected the group. Cards in no group come through untouched.
 */
export function expandToGroups(groups: CardGroup[], ids: Iterable<string>): Set<string> {
  const index = groupIndex(groups)
  const out = new Set<string>()
  for (const id of ids) {
    const g = index.get(id)
    if (g) for (const m of g.ids) out.add(m)
    else out.add(id)
  }
  return out
}
