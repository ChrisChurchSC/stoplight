import { useEffect, useMemo, useState } from 'react'
import { SHARE_ACCESS, SHAREABLE_ROLES, type ShareableRole } from '../domain/access'
import { brandFromBoard, canvasBrandScope, isBrandless } from '../domain/brand'
import { DRAFTS_SPACE, clientForCampaign } from '../domain/clients'
import { boardFor } from '../domain/flowBoard'
import { encodeShareToken, shareUrl } from '../lib/shareLink'
import { publishShareSnapshot } from '../lib/shareSnapshot'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Owner-only. ONE link per campaign (or per brand) at each access level, ready to copy the
 * moment the dialog opens.
 *
 * It used to mint them. You picked a role from two cards, pressed Create, then pressed Copy,
 * and every Create added another row to a list of opaque ids you could not tell apart, so
 * revoking the right one was guesswork and the extra links bought nothing that one link did
 * not. Handing out a campaign is a single link, so the dialog reuses it instead of stacking
 * new ones, and the access choice moved to a two-option switch under the link rather than a
 * decision standing in front of it.
 */
export function ShareDialog() {
  const open = useTrafficStore((s) => s.shareDialogOpen)
  const close = useTrafficStore((s) => s.closeShareDialog)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientList = useTrafficStore((s) => s.clientList)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const flowBoards = useTrafficStore((s) => s.flowBoards)
  const brandObjects = useTrafficStore((s) => s.brandObjects)
  const campaign = useTrafficStore((s) => s.shareDialogCampaign)
  const shares = useTrafficStore((s) => s.shares)
  const createShare = useTrafficStore((s) => s.createShare)
  const revokeShare = useTrafficStore((s) => s.revokeShare)

  const [role, setRole] = useState<ShareableRole>('stakeholder')
  const [copied, setCopied] = useState(false)
  // Stop sharing has to outlast the mint-on-open effect below, or pressing it would hand
  // straight back the link it just revoked.
  const [stopped, setStopped] = useState(false)

  /** Every brand the workspace holds, however it was registered — the same union the brand sheet
   *  seeds itself from, because a brand can exist as a campaign's client before it is ever added
   *  to the client list. */
  const brandNames = useMemo(() => {
    const names = new Set<string>()
    for (const c of clientList) names.add(c)
    for (const c of campaignList) names.add(c.client)
    return [...names].filter((n) => n && n !== DRAFTS_SPACE && !isBrandless(n))
  }, [clientList, campaignList])

  /**
   * THE BRAND THIS LINK IS SCOPED TO. The campaign's binding, then the Brand card on its board,
   * then the canvas rule — never the raw workspace filter on its own.
   *
   * This read clientFilter and nothing else, and clientFilter is not where a campaign's brand
   * lives. It is a browsing scope that resets to 'all' on every load, and the Campaigns index
   * opens a campaign without narrowing it (deliberately: the index has to keep showing every
   * brand's work). So a campaign opened from the index sat on a board that named its brand
   * everywhere — the rail, the pickers, the Brand card wired into the brief — while Share alone
   * answered "Pick a brand first, then share." Nothing was unset; the dialog was asking a
   * different question from the rest of the app and reporting the answer as a missing brand.
   *
   * The campaign's own answer wins over the filter rather than merely filling in for it, because
   * the snapshot behind the link is built per brand (voice, proof, audiences, profile), and a
   * campaign handed out under whichever brand the rail happened to be on would carry another
   * brand's library.
   *
   * And its own answer is the binding OR the Brand card, because a campaign can be generating every
   * word of its copy from a Brand card wired into its brief while its record still says nobody —
   * bindCampaignBrand writes that record when the wire is drawn, so any campaign predating the wiring
   * has its brand on the board and nowhere else. That is the state the Made from column was taught to
   * read a release ago, and this dialog is the same question asked from a different surface: the
   * brand is not missing, it is on the card.
   */
  // The campaign record and the name→client resolver are kept in step by bindCampaignBrand, but
  // only the record is a store slice, so reading it first is what makes the dialog re-render when
  // the Brand card on the board changes the binding under it.
  const bound = campaign
    ? campaignList.find((c) => c.name === campaign)?.client?.trim() || clientForCampaign(campaign)
    : ''
  const filed = !isBrandless(bound) && bound !== DRAFTS_SPACE
  const onBoard = useMemo(
    () =>
      campaign && !filed
        ? brandFromBoard(boardFor(flowBoards, campaign), (refId) => brandObjects.find((b) => b.id === refId)?.name)
        : '',
    [campaign, filed, flowBoards, brandObjects],
  )
  const client = filed ? bound : onBoard || canvasBrandScope(clientFilter, brandNames)

  // A campaign share shows that campaign's links; a brand share shows the brand-level
  // (campaign-less) ones. Newest first, because createShare prepends.
  const scoped = shares.filter((s) => s.client === client && (campaign ? s.campaign === campaign : !s.campaign))
  const atRole = scoped.filter((s) => s.role === role)
  const link = atRole[0] ?? null
  // Duplicates left over from the dialog that could stack any number of links. Nothing else
  // surfaces them now, and a live grant nobody can see is a live grant nobody can revoke.
  const extra = atRole.slice(1)
  // Nothing resolved: no campaign brand, no brand chosen, and more than one to choose between.
  // Reachable from the workspace Share button before a brand is picked.
  const shareable = !!client && client !== 'all'

  useEffect(() => setCopied(false), [role, link?.id])
  useEffect(() => setStopped(false), [open, campaign, client])

  useEffect(() => {
    if (!open || stopped || !shareable) return
    if (!link) {
      createShare(client, role, campaign ?? undefined)
      return
    }
    // Opening republishes, so a recipient sees the campaign as it stands now. This used to
    // be a Refresh button, which only worked if the owner knew a share is a point-in-time
    // snapshot and thought to press it.
    void publishShareSnapshot(useTrafficStore.getState(), link.client, link.role, link.id, link.campaign)
  }, [open, stopped, shareable, link, client, role, campaign, createShare])

  if (!open) return null

  const subject = campaign ? campaign.replace(`${client} — `, '') : client
  const noun = campaign ? 'campaign' : 'workspace'
  const url = link
    ? shareUrl(encodeShareToken({ client: link.client, role: link.role, id: link.id, campaign: link.campaign }))
    : ''

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      /* clipboard blocked; the field is selectable as a fallback */
    }
  }
  const dismiss = () => {
    setCopied(false)
    close()
  }
  const stop = () => {
    for (const s of atRole) revokeShare(s.id)
    setStopped(true)
    setCopied(false)
  }

  return (
    <>
      <div className="share-scrim" onClick={dismiss} />
      <div className="share-dialog" role="dialog" aria-label={`Share ${subject}`}>
        <div className="share-head">
          <span className="share-title">Share {subject}</span>
          <button className="share-x" onClick={dismiss} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="share-sub">
          Anyone with this link can {SHARE_ACCESS[role].can} this {noun}. No account needed.
        </p>

        {!shareable ? (
          <div className="share-blocked">Pick a brand first, then share.</div>
        ) : link ? (
          <div className="share-link-row">
            <input className="share-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn sm primary share-copy" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <button className="btn primary share-make" onClick={() => setStopped(false)}>
            Create a link
          </button>
        )}

        {shareable && (
          <div className="share-foot">
            <div className="share-access" role="group" aria-label="Link access">
              {SHAREABLE_ROLES.map((r) => (
                <button
                  key={r}
                  className={`share-access-opt${role === r ? ' on' : ''}`}
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                >
                  {SHARE_ACCESS[r].label}
                </button>
              ))}
            </div>
            {link && (
              <button className="share-stop" onClick={stop}>
                Stop sharing
              </button>
            )}
          </div>
        )}

        {extra.length > 0 && (
          <div className="share-extra">
            <span>
              {extra.length} older link{extra.length > 1 ? 's' : ''} still open{extra.length > 1 ? '' : 's'} this {noun}.
            </span>
            <button className="share-extra-revoke" onClick={() => extra.forEach((s) => revokeShare(s.id))}>
              Revoke
            </button>
          </div>
        )}
      </div>
    </>
  )
}
