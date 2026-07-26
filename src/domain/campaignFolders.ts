/**
 * CAMPAIGN FOLDERS: a folder is a PATH, and the path is the whole data structure.
 *
 * "Q3 launches/Paid/Meta" is a folder three levels deep. There is no folder record, no id and no
 * parent pointer: a folder exists because its path is in the brand's list, and its place in the tree
 * is readable from the string. That is what makes this change cheap — a Campaign already carries
 * `folder?: string`, and every folder that existed before this file was a one-segment path, so old
 * data is already valid and needs no migration.
 *
 * The cost is that the separator is reserved. A folder cannot be NAMED "Paid/Organic", because that
 * is two folders; sanitizeSegment strips the slash rather than rejecting the name, so typing it
 * gets you "PaidOrganic" instead of a silently nested pair.
 *
 * WHY FOLDERS AND NOT FLIGHTS: the campaign view used to fake folders out of flights — a campaign
 * with more than one scheduled run drilled in like a directory. That conflated "how do I organize
 * fifty campaigns" with "when does this one run", so the only way to get a folder was to schedule a
 * second run of something. Folders are now their own thing, and the flight level is gone from this
 * view entirely.
 */

/** Folders nest four levels: "a/b/c/d". Deeper than this and the tree stops being scannable. */
export const MAX_FOLDER_DEPTH = 4

export const FOLDER_SEP = '/'

/** The segments of a path. "" → []. */
export const folderSegments = (path: string): string[] => path.split(FOLDER_SEP).filter(Boolean)

/** How deep a path sits. A top-level folder is 1. */
export const folderDepth = (path: string): number => folderSegments(path).length

/** The name shown on the folder, i.e. its last segment. */
export const folderName = (path: string): string => folderSegments(path).at(-1) ?? path

/** The path of the folder that contains this one, or '' for a top-level folder. */
export const folderParent = (path: string): string => folderSegments(path).slice(0, -1).join(FOLDER_SEP)

/** Every ancestor of a path, outermost first: "a/b/c" → ["a", "a/b"]. */
export function folderAncestors(path: string): string[] {
  const segs = folderSegments(path)
  return segs.slice(0, -1).map((_, i) => segs.slice(0, i + 1).join(FOLDER_SEP))
}

/** True when `path` is inside `ancestor` at any depth. A folder does not contain itself. */
export const isDescendantFolder = (path: string, ancestor: string): boolean =>
  path.startsWith(`${ancestor}${FOLDER_SEP}`)

/**
 * A typed folder name, made safe to sit in a path. The separator is stripped rather than escaped:
 * there is no way to express a literal slash in a name, and pretending otherwise would mean every
 * reader of a path needed an unescaper.
 */
export const sanitizeSegment = (name: string): string => name.split(FOLDER_SEP).join('').trim()

/** Can a child be created under this folder, or is it already as deep as folders go? */
export const canNestUnder = (parentPath: string): boolean => folderDepth(parentPath) < MAX_FOLDER_DEPTH

/**
 * Join a parent path and a typed name into a new folder path, or null if the name is empty or the
 * result would be too deep. Callers treat null as "do nothing".
 */
export function buildFolderPath(parentPath: string, name: string): string | null {
  const seg = sanitizeSegment(name)
  if (!seg) return null
  const path = parentPath ? `${parentPath}${FOLDER_SEP}${seg}` : seg
  return folderDepth(path) <= MAX_FOLDER_DEPTH ? path : null
}

/**
 * Every path in the list plus the ancestors implied by it, deduped and sorted so a parent always
 * precedes its children. A campaign dragged onto a nested folder registers only the leaf, so
 * without this the tree would have a hole where its parent should be.
 */
export function withAncestors(paths: string[]): string[] {
  const all = new Set<string>()
  for (const p of paths) {
    if (!p) continue
    for (const a of folderAncestors(p)) all.add(a)
    all.add(p)
  }
  return [...all].sort((a, b) => a.localeCompare(b))
}

export interface FolderNode<T> {
  path: string
  name: string
  depth: number
  children: FolderNode<T>[]
  /** The items filed directly here. Items in a child folder are NOT included. */
  items: T[]
}

/**
 * Build the folder tree for one brand. `folderOf` reads an item's path; anything whose path is not
 * a known folder is left out of the tree entirely, so the caller can show it as unfiled rather than
 * having it vanish into a folder nobody can see.
 */
export function buildFolderTree<T>(paths: string[], items: T[], folderOf: (item: T) => string | undefined): FolderNode<T>[] {
  const known = withAncestors(paths)
  const byPath = new Map<string, FolderNode<T>>()
  for (const path of known) {
    byPath.set(path, { path, name: folderName(path), depth: folderDepth(path), children: [], items: [] })
  }
  for (const item of items) {
    const f = folderOf(item)
    if (f) byPath.get(f)?.items.push(item)
  }
  const roots: FolderNode<T>[] = []
  // `known` is sorted parent-before-child, so a parent node always exists by the time a child
  // looks for it.
  for (const node of byPath.values()) {
    const parent = folderParent(node.path)
    if (parent) byPath.get(parent)?.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** Items filed here or in any folder below, for the count on a collapsed parent. */
export function countDeep<T>(node: FolderNode<T>): number {
  return node.items.length + node.children.reduce((n, c) => n + countDeep(c), 0)
}
