import { useMemo, useRef, useState } from 'react'
import type { AudienceType } from '../domain/audiences'
import { detectBreaks } from '../domain/breaks'
import { CHANNELS } from '../domain/channels'
import { clientForCampaign } from '../domain/clients'
import { funnelStageFor } from '../domain/funnel'
import { buildMatrix, type MatrixCell } from '../domain/matrix'
import { draftCellRow } from '../domain/matrixDraft'
import { messagingFields } from '../domain/messaging'
import { formatOf } from '../domain/presence'
import { rtbsForCampaign, type Rtb } from '../domain/rtb'
import type { TrafficRow } from '../domain/types'
import { draftCellCopy } from '../adapters/copy/draftCellTransport'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Layer — Personalize: the audience x stage x channel matrix. Every cell is the
 * tailored message for one audience at one journey stage, composed from the
 * Foundation (angle, proof, outcome) and ranked by what's actually working. Live
 * coverage overlays it so gaps and unreachable stages show at a glance. Click a
 * cell to open the per-channel breakdown and the starting message.
 */

const fmtEng = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

function heatClass(cell: MatrixCell): string {
  if (cell.blocked) return 'blocked'
  if (cell.covered === 0) return 'gap'
  if (cell.covered >= 3) return 'strong'
  return 'thin'
}

export function MatrixView() {
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const rows = useTrafficStore((s) => s.rows)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setIcpOpen = useTrafficStore((s) => s.setIcpOpen)
  const draftMatrixCell = useTrafficStore((s) => s.draftMatrixCell)
  const draftMatrixCells = useTrafficStore((s) => s.draftMatrixCells)
  const brandGuides = useTrafficStore((s) => s.brandGuides)

  // Drafted assets roll up to the brand's campaign so they scope + run the check.
  const draftCampaign = campaignList.find((c) => c.client === clientFilter)?.name
  const draftSeq = useRef(0)
  const [drafting, setDrafting] = useState(false)
  const [lastDraft, setLastDraft] = useState<
    { name: string; channel: string; coherent: boolean; note: string } | null
  >(null)
  const [filling, setFilling] = useState(false)
  const [fillResult, setFillResult] = useState<{ count: number; coherent: number } | null>(null)

  const brandRows = useMemo(
    () => rows.filter((r) => clientForCampaign(r.campaign) === clientFilter),
    [rows, clientFilter],
  )

  // The brand's proof library, deduped — same resolution the Foundation uses.
  const rtbById = useMemo(() => {
    const names = [
      ...new Set([
        ...campaignList.filter((c) => c.client === clientFilter).map((c) => c.name),
        ...brandRows.map((r) => (r.campaign ?? '').trim()).filter(Boolean),
      ]),
    ]
    const map = new Map<string, Rtb>()
    for (const name of names) for (const rtb of rtbsForCampaign(name)) if (!map.has(rtb.id)) map.set(rtb.id, rtb)
    return map
  }, [campaignList, clientFilter, brandRows])

  const audiences: AudienceType[] = clientAudiences[clientFilter] ?? []
  const matrix = useMemo(() => buildMatrix(audiences, brandRows, rtbById), [audiences, brandRows, rtbById])

  const [sel, setSel] = useState<{ aud: number; stage: number } | null>(null)
  const selRow = sel ? matrix.rows[sel.aud] : null
  const selCell = sel && selRow ? selRow.cells[sel.stage] : null

  const assetsHere =
    selRow && selCell
      ? brandRows.filter(
          (r) =>
            (r.audience ?? '').trim() === selRow.audience.name.trim() &&
            funnelStageFor(r.channel, r.assetType) === selCell.stage,
        )
      : []

  // The cell's live channel if it has one, else a suggested channel that opens the
  // stage — so even a blocked cell can be drafted (open + fill in one move). Prefer
  // a suggested channel that actually lands in this stage (a channel's default
  // funnel stage can differ), so the draft fills the cell it was meant for.
  const draftChannelFor = (cell: MatrixCell) =>
    cell.channels[0]?.id ??
    cell.suggestChannelIds.find((id) => funnelStageFor(id) === cell.stage) ??
    cell.suggestChannelIds[0]

  async function doDraft() {
    if (!selRow || !selCell || !draftCampaign || drafting || sel === null) return
    const channelId = draftChannelFor(selCell)
    if (!channelId) return
    const channelLabel = CHANNELS[channelId]?.label ?? channelId
    setDrafting(true)
    const row = draftCellRow({
      audience: selRow.audience,
      cell: selCell,
      channel: channelId,
      campaign: draftCampaign,
      index: draftSeq.current++,
      now: Date.now(),
    })
    // Claude refinement: generate the actual per-component copy from the brand
    // model. Falls back to the deterministic composition already in row.messaging
    // when the backend has no key / errors — so drafting always works.
    const stageMeta = matrix.stages[sel.stage]
    const fields = messagingFields(channelId, row.assetType)
    const lead = selCell.proof[0]?.rtb
    const claudeMsg = await draftCellCopy({
      client: clientFilter,
      audience: {
        name: selRow.audience.name,
        role: selRow.audience.role,
        angle: selRow.audience.messageAngle,
        outcome: selRow.audience.outcome,
      },
      stage: { key: stageMeta.stage, label: stageMeta.label, intent: stageMeta.hint },
      channel: { id: channelId, label: channelLabel, format: formatOf(channelId) },
      components: fields.map((f) => ({
        key: f.key,
        label: f.label,
        recommended: f.recommended,
        hardLimit: f.hardLimit,
        multiline: f.multiline,
      })),
      proof: lead ? { label: lead.label, detail: lead.detail } : null,
      cta: selCell.cta,
      voice: brandGuides[clientFilter]?.guide?.voice,
    })
    if (claudeMsg) {
      const merged = { ...row.messaging }
      for (const f of fields) {
        const v = claudeMsg[f.key]
        if (v) merged[f.key] = f.hardLimit && v.length > f.hardLimit ? `${v.slice(0, f.hardLimit - 1).trimEnd()}…` : v
      }
      row.messaging = merged
    }
    // Run the connection check on the new asset in context so its coherence shows
    // the instant it's generated.
    const brk = detectBreaks([...brandRows, row]).find(
      (b) => b.from.assetName === row.assetName && b.from.channel === row.channel,
    )
    await draftMatrixCell(row)
    setLastDraft({
      name: row.assetName,
      channel: channelLabel,
      coherent: !brk,
      note: brk
        ? brk.headline
        : `${claudeMsg ? 'Claude-written' : 'Composed from the model'} · proof attached, on-voice CTA — clears the check.`,
    })
    setDrafting(false)
  }

  // The scale move: one click drafts a governed variant for every gap (a cell with
  // a recipe + channels but no content yet), checks the whole batch, and fills it.
  async function doFillGaps() {
    if (!draftCampaign || filling) return
    const now = Date.now()
    const newRows: TrafficRow[] = []
    for (const row of matrix.rows) {
      for (const cell of row.cells) {
        if (cell.covered > 0) continue // already has content
        const channelId = draftChannelFor(cell)
        if (!channelId) continue
        newRows.push(
          draftCellRow({
            audience: row.audience,
            cell,
            channel: channelId,
            campaign: draftCampaign,
            index: draftSeq.current++,
            now,
          }),
        )
      }
    }
    if (!newRows.length) return
    setFilling(true)
    const broken = new Set(
      detectBreaks([...brandRows, ...newRows]).map((b) => `${b.from.assetName}|${b.from.channel ?? ''}`),
    )
    const coherent = newRows.filter((r) => !broken.has(`${r.assetName}|${r.channel}`)).length
    await draftMatrixCells(newRows)
    setFillResult({ count: newRows.length, coherent })
    setFilling(false)
  }

  if (audiences.length === 0) {
    return (
      <div className="mtx">
        <header className="mtx-head">
          <div>
            <h1 className="csh-title">Personalization matrix</h1>
            <p className="csh-sub">Every audience × journey stage × channel — the tailored message, what's covered, and what's working.</p>
          </div>
        </header>
        <div className="mtx-empty">
          <p>Define {clientFilter}'s audiences in the Foundation to build the matrix. Each audience becomes a row; the journey stages are the columns.</p>
          <button className="csh-new" onClick={() => setIcpOpen(true)}>Define audiences →</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mtx">
      <header className="mtx-head">
        <div>
          <h1 className="csh-title">Personalization matrix</h1>
          <p className="csh-sub">Every audience × journey stage × channel — the tailored message, what's covered, and what's working.</p>
        </div>
        <div className="mtx-totals">
          <span className="mtx-total t-covered"><b>{matrix.totals.covered}</b> covered</span>
          <span className="mtx-total t-gap"><b>{matrix.totals.gaps}</b> gaps</span>
          <span className="mtx-total t-blocked"><b>{matrix.totals.blocked}</b> no channel</span>
          {matrix.totals.gaps + matrix.totals.blocked > 0 && (
            <button
              className="mtx-fill-btn"
              onClick={doFillGaps}
              disabled={filling || !draftCampaign}
              title={
                draftCampaign
                  ? 'Draft a governed variant for every empty cell from the brand model (opening a channel where one is needed), checked on commit'
                  : 'Add a campaign for this client first'
              }
            >
              {filling
                ? 'Drafting…'
                : `✦ Fill ${matrix.totals.gaps + matrix.totals.blocked} empty cell${matrix.totals.gaps + matrix.totals.blocked === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </header>

      {fillResult && (
        <div className={`mtx-fill-result ${fillResult.coherent === fillResult.count ? 'ok' : 'warn'}`}>
          {fillResult.coherent === fillResult.count
            ? `✓ Drafted ${fillResult.count} variant${fillResult.count === 1 ? '' : 's'} from the brand model — every one coheres.`
            : `Drafted ${fillResult.count} · ${fillResult.coherent} coherent, ${fillResult.count - fillResult.coherent} need a look.`}
        </div>
      )}

      <div className="mtx-grid-wrap">
        <div className="mtx-grid" style={{ gridTemplateColumns: `220px repeat(${matrix.stages.length}, minmax(200px, 1fr))` }}>
          {/* Column headers */}
          <div className="mtx-corner">Audience ↓ &nbsp;/&nbsp; Stage →</div>
          {matrix.stages.map((s) => (
            <div key={s.stage} className="mtx-colhead">
              <span className="mtx-colhead-label">{s.label}</span>
              <span className="mtx-colhead-hint">{s.hint}</span>
            </div>
          ))}

          {/* Rows */}
          {matrix.rows.map((row, ai) => (
            <RowCells
              key={row.audience.id}
              audIdx={ai}
              name={row.audience.name || 'Unnamed audience'}
              role={row.audience.role}
              outcome={row.audience.outcome}
              cells={row.cells}
              sel={sel}
              onPick={(stage) => {
                setSel({ aud: ai, stage })
                setLastDraft(null)
              }}
            />
          ))}
        </div>
      </div>

      {/* Cell detail — the channel axis + the starting message. */}
      {selRow && selCell && (
        <div className="mtx-drawer-scrim" onClick={() => setSel(null)}>
          <aside className="mtx-drawer" onClick={(e) => e.stopPropagation()}>
            <button className="mtx-drawer-x" onClick={() => setSel(null)} aria-label="Close">×</button>
            <div className="mtx-drawer-eyebrow">
              {selRow.audience.name}
              {selRow.audience.outcome ? <span className="mtx-drawer-out">🎯 {selRow.audience.outcome}</span> : null}
            </div>
            <h2 className="mtx-drawer-title">{matrix.stages[sel!.stage].label}</h2>
            <p className="mtx-drawer-hint">{matrix.stages[sel!.stage].hint}</p>

            {/* Starting message */}
            <div className="mtx-msg">
              <div className="mtx-msg-k">Starting message <span>adapt before sending</span></div>
              <p className="mtx-msg-body">{selCell.suggestion}</p>
              <div className="mtx-cta">CTA: <b>{selCell.cta}</b></div>
              <button
                className="mtx-copy"
                onClick={() => navigator.clipboard?.writeText(selCell.suggestion)}
              >
                Copy starting message
              </button>
            </div>

            {/* Draft from the brand model → a real asset, checked on the spot. This
                is the scale move: fill the cell with a governed, coherent variant. */}
            <div className="mtx-draft">
              {(() => {
                const chId = draftChannelFor(selCell)
                const chLabel = chId ? CHANNELS[chId]?.label ?? chId : ''
                return (
                  <button
                    className="mtx-draft-btn"
                    onClick={doDraft}
                    disabled={drafting || !chId || !draftCampaign}
                    title={
                      !chId
                        ? 'No channel to draft for this cell'
                        : !draftCampaign
                          ? 'Add a campaign for this client first'
                          : `Draft a ${chLabel} asset from the brand model${selCell.blocked ? ' (opens this stage)' : ''}`
                    }
                  >
                    {drafting
                      ? 'Drafting…'
                      : `✦ Draft this cell${chLabel ? ` (${chLabel}${selCell.blocked ? ', opens stage' : ''})` : ''}`}
                  </button>
                )
              })()}
              {lastDraft && (
                <div className={`mtx-draft-result ${lastDraft.coherent ? 'ok' : 'bad'}`}>
                  <span className="mtx-draft-verdict">
                    {lastDraft.coherent ? '✓ Coheres' : '⚠ Break'}
                  </span>
                  <span className="mtx-draft-asset">
                    {lastDraft.name} → {lastDraft.channel}
                  </span>
                  <span className="mtx-draft-note">{lastDraft.note}</span>
                </div>
              )}
            </div>

            {/* Proof ranked by what's working */}
            <div className="mtx-sec">
              <div className="mtx-sec-k">Lead with proof <span>best-performing first</span></div>
              {selCell.proof.length ? (
                <ul className="mtx-proof">
                  {selCell.proof.map((p, i) => (
                    <li key={p.rtb.id} className="mtx-proof-li">
                      <span className="mtx-proof-rank">{i + 1}</span>
                      <span className="mtx-proof-label">{p.rtb.label}</span>
                      <span className="mtx-proof-eng">{p.avgEng != null ? `${fmtEng(p.avgEng)} avg` : 'no data yet'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mtx-muted">No proof emphasized for this audience yet. Set it in the Foundation.</p>
              )}
            </div>

            {/* The channel axis */}
            <div className="mtx-sec">
              <div className="mtx-sec-k">By channel <span>where this lands</span></div>
              {selCell.blocked ? (
                <p className="mtx-muted">
                  No channel reaches {matrix.stages[sel!.stage].label.toLowerCase()} for this audience.
                  {selCell.suggestChannels.length ? <> Add {selCell.suggestChannels.join(' · ')}.</> : null}
                </p>
              ) : (
                <ul className="mtx-chans">
                  {selCell.channels.map((c) => (
                    <li key={c.id} className="mtx-chan-li">
                      <div className="mtx-chan-top">
                        <span className="mtx-chan-dot" style={{ background: c.color }} />
                        <span className="mtx-chan-label">{c.label}</span>
                        <span className="mtx-chan-fmt">{c.format}</span>
                        {c.used ? (
                          <span className="mtx-chan-tag used">{c.covered} live · {fmtEng(c.engagement)} eng</span>
                        ) : (
                          <span className="mtx-chan-tag plan">planned</span>
                        )}
                      </div>
                      <div className="mtx-chan-hook">{c.hook}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Live coverage */}
            <div className="mtx-sec">
              <div className="mtx-sec-k">Live here <span>{assetsHere.length} asset{assetsHere.length === 1 ? '' : 's'}</span></div>
              {assetsHere.length ? (
                <ul className="mtx-assets">
                  {assetsHere.slice(0, 8).map((r) => (
                    <li key={r.id} className="mtx-asset">
                      <span className="mtx-asset-name">{r.assetName}</span>
                      <span className="mtx-asset-meta">{r.channel}{r.engagement ? ` · ${fmtEng(r.engagement.likes + r.engagement.comments)} eng` : ''}</span>
                    </li>
                  ))}
                  {assetsHere.length > 8 ? <li className="mtx-muted">+ {assetsHere.length - 8} more</li> : null}
                </ul>
              ) : (
                <p className="mtx-muted">Nothing live here yet. This is a personalization gap — the recipe above is ready to fill it.</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function RowCells({
  audIdx,
  name,
  role,
  outcome,
  cells,
  sel,
  onPick,
}: {
  audIdx: number
  name: string
  role: string
  outcome?: string
  cells: MatrixCell[]
  sel: { aud: number; stage: number } | null
  onPick: (stage: number) => void
}) {
  return (
    <>
      <div className="mtx-rowhead">
        <span className="mtx-rowhead-name">{name}</span>
        {role ? <span className="mtx-rowhead-role">{role}</span> : null}
        {outcome ? <span className="mtx-rowhead-out">🎯 {outcome}</span> : null}
      </div>
      {cells.map((cell, si) => {
        const active = sel?.aud === audIdx && sel?.stage === si
        const lead = cell.proof[0]
        return (
          <button
            key={cell.stage}
            className={`mtx-cell ${heatClass(cell)}${active ? ' active' : ''}`}
            onClick={() => onPick(si)}
          >
            <div className="mtx-cell-badge">
              {cell.blocked ? (
                <span className="mtx-badge blocked">no channel</span>
              ) : cell.covered === 0 ? (
                <span className="mtx-badge gap">gap</span>
              ) : (
                <span className="mtx-badge covered">{cell.covered} live · {fmtEng(cell.engagement)} eng</span>
              )}
            </div>
            {lead ? (
              <div className="mtx-cell-proof">
                {lead.rtb.label}
                {lead.avgEng != null ? <span className="mtx-cell-proof-eng">{fmtEng(lead.avgEng)}</span> : null}
              </div>
            ) : (
              <div className="mtx-cell-proof muted">no proof set</div>
            )}
            <div className="mtx-cell-cta">→ {cell.cta}</div>
            {cell.blocked ? (
              cell.suggestChannels.length ? <div className="mtx-cell-chans muted">add {cell.suggestChannels.slice(0, 2).join(' · ')}</div> : null
            ) : (
              <div className="mtx-cell-chans">
                {cell.channels.slice(0, 4).map((c) => (
                  <span key={c.id} className={`mtx-cdot${c.used ? '' : ' plan'}`} style={{ background: c.used ? c.color : 'transparent', borderColor: c.color }} title={`${c.label}${c.used ? ` · ${c.covered} live` : ' · planned'}`} />
                ))}
              </div>
            )}
          </button>
        )
      })}
    </>
  )
}
