import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TrafficRow } from '../domain/types'

/**
 * FlowVariantTree — a drill-down explorer for a deliverable's fan-out variants. Rather than
 * rendering all 1,000+ variants at once, it shows one level at a time as columns (Audience →
 * Location → Journey → … → asset), Finder/Miller-column style: click a card to reveal the next
 * level to its right; only the active path renders, so it stays compact and legible however deep
 * the fan-out goes. Group cards roll up what's beneath them (sub-levels + asset counts).
 */

export const VARIANT_DIMS = ['audience', 'location', 'journey', 'lifecycle', 'intent', 'tier', 'channel', 'time'] as const

const DIM_LABEL: Record<string, string> = {
  audience: 'Audience', location: 'Location', journey: 'Journey', lifecycle: 'Lifecycle',
  intent: 'Intent', tier: 'Tier', channel: 'Channel', time: 'Time',
}

/** A row is a fanned variant if its lineage carries any personalization dimension. */
export const isVariantRow = (r: TrafficRow): boolean => VARIANT_DIMS.some((d) => !!r.lineage?.[d])

const LEAF_CAP = 40

type Group = { key: string; dim: string; value: string; count: number; children: Group[]; leaves: TrafficRow[] }

function dimsPresent(rows: TrafficRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) for (const d of VARIANT_DIMS) if (r.lineage?.[d]) set.add(d)
  return VARIANT_DIMS.filter((d) => set.has(d))
}

function buildTree(rows: TrafficRow[], dims: string[], depth: number): { children: Group[]; leaves: TrafficRow[] } {
  if (depth >= dims.length) return { children: [], leaves: rows }
  const dim = dims[depth]
  const groups = new Map<string, TrafficRow[]>()
  const noVal: TrafficRow[] = []
  for (const r of rows) {
    const v = r.lineage?.[dim]
    if (!v) { noVal.push(r); continue }
    const g = groups.get(v)
    if (g) g.push(r)
    else groups.set(v, [r])
  }
  const children: Group[] = []
  for (const [value, gr] of groups) {
    const sub = buildTree(gr, dims, depth + 1)
    children.push({ key: `${dim}:${value}:${depth}`, dim, value, count: gr.length, children: sub.children, leaves: sub.leaves })
  }
  children.sort((a, b) => a.value.localeCompare(b.value))
  return { children, leaves: noVal }
}

function countAssets(g: Group): number {
  return g.leaves.length + g.children.reduce((s, c) => s + countAssets(c), 0)
}

const Chevron = ({ active }: { active: boolean }) => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto', opacity: active ? 0.9 : 0.4 }}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)

function GroupCard({ g, tone, selected, onClick }: { g: Group; tone: string; selected: boolean; onClick: () => void }) {
  const subLabel = g.children.length
    ? `${g.children.length} ${DIM_LABEL[g.children[0].dim]?.toLowerCase() ?? 'sub'}${g.children.length === 1 ? '' : 's'} · ${countAssets(g)} assets`
    : `${g.leaves.length} asset${g.leaves.length === 1 ? '' : 's'}`
  return (
    <button
      className="flow-node flow-brief-node"
      onClick={onClick}
      style={{
        cursor: 'pointer', flex: '0 0 auto', textAlign: 'left',
        borderColor: selected ? tone : undefined,
        boxShadow: selected ? `0 0 0 2px ${tone}, 0 2px 8px rgba(16,24,40,.06)` : undefined,
        background: selected ? `color-mix(in srgb, ${tone} 8%, var(--surface))` : undefined,
      }}
    >
      <div className="flow-node-main">
        <span style={{ width: 20, height: 20, borderRadius: 6, background: tone, flex: '0 0 auto' }} />
        <div className="flow-node-text" style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#8a969b', textTransform: 'uppercase', letterSpacing: '.03em' }}>{DIM_LABEL[g.dim] ?? g.dim}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#8a969b', fontVariantNumeric: 'tabular-nums' }}>×{g.count}</span>
            <Chevron active={selected} />
          </div>
          <div className="flow-node-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.value}</div>
          <div style={{ fontSize: 10.5, color: '#98a4a9', marginTop: 1 }}>{subLabel}</div>
        </div>
      </div>
    </button>
  )
}

function LeafCard({ r, tone, copy }: { r: TrafficRow; tone: string; copy: (r: TrafficRow) => { head: string; body: string } }) {
  const c = copy(r)
  return (
    <div className="flow-node flow-brief-node" style={{ flex: '0 0 auto' }}>
      <div className="flow-node-main">
        <span style={{ width: 20, height: 20, borderRadius: 999, border: `2px solid ${tone}`, flex: '0 0 auto' }} />
        <div className="flow-node-text" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#8a969b', textTransform: 'uppercase', letterSpacing: '.03em' }}>Asset</div>
          <div className="flow-node-label">{c.head || '(untitled variant)'}</div>
        </div>
      </div>
      {c.body && (
        <div className="flow-copy"><div className="flow-copy-body">{c.body}</div></div>
      )}
    </div>
  )
}

const Connector = () => (
  <div style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto', alignSelf: 'stretch' }}>
    <div style={{ width: 40, height: 2, background: '#cfe0e5' }} />
  </div>
)

export function FlowVariantTree({ rows, tone, copy, onMeasure }: {
  rows: TrafficRow[]
  tone: string
  copy: (r: TrafficRow) => { head: string; body: string }
  onMeasure?: (height: number) => void
}) {
  const { children, leaves } = useMemo(() => {
    const dims = dimsPresent(rows)
    return buildTree(rows, dims, 0)
  }, [rows])
  // The active drill path — one selected group key per level. Empty = only the first column shows.
  const [path, setPath] = useState<string[]>([])

  // Resolve the columns to render from the active path: level 0, then the children of each
  // selected group down the path.
  const columns = useMemo(() => {
    const cols: { groups: Group[]; leaves: TrafficRow[] }[] = [{ groups: children, leaves }]
    let level = children
    for (const key of path) {
      const g = level.find((x) => x.key === key)
      if (!g) break
      cols.push({ groups: g.children, leaves: g.leaves })
      level = g.children
      if (!g.children.length) break
    }
    return cols
  }, [children, leaves, path])

  const select = (depth: number, key: string) => setPath((prev) => {
    const next = prev.slice(0, depth)
    if (prev[depth] === key) return next // clicking the selected card collapses deeper levels
    next[depth] = key
    return next
  })

  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !onMeasure) return
    const report = () => onMeasure(el.scrollHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onMeasure, path, rows])

  return (
    <div ref={ref} style={{ marginTop: 6, paddingBottom: 6, flex: '0 0 auto' }}>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 0 }}>
        {columns.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', alignItems: 'flex-start', flex: '0 0 auto' }}>
            {ci > 0 && <Connector />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '0 0 auto' }}>
              {col.groups.map((g) => (
                <GroupCard key={g.key} g={g} tone={tone} selected={path[ci] === g.key} onClick={() => select(ci, g.key)} />
              ))}
              {col.leaves.slice(0, LEAF_CAP).map((r) => <LeafCard key={r.id} r={r} tone={tone} copy={copy} />)}
              {col.leaves.length > LEAF_CAP && (
                <div style={{ fontSize: 11, color: '#8a969b', fontStyle: 'italic', padding: '4px 8px' }}>+ {col.leaves.length - LEAF_CAP} more</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
