import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import {
  creativeMeta,
  creativeSummary,
  unsyncedCount,
  type CardMedia,
} from '../domain/cardMedia'
import { getBytes, localUrl } from '../lib/creativeBytes'
import {
  creativeDownloadUrl,
  creativeUrl,
  isCreativeBackendConfigured,
} from '../adapters/media/creativeStore'

/**
 * THE FINISHED CREATIVE, ON THE CARD THAT DESCRIBES IT.
 *
 * The output card's panel already holds the copy, the channel, the audience and the date. This is
 * the one thing that used to live somewhere else — a Drive folder, a Slack thread, an email — so
 * the person assembling the campaign had to hold the join in their head, and the person reviewing
 * it had to ask.
 *
 * ITS OWN FILE, not another five hundred lines in FlowsView. Every tile resolves its own URL
 * asynchronously (a local blob, or a signed URL from the bucket) and that is a hook per tile —
 * which cannot be written inside a render function that is already conditional.
 */

/**
 * A displayable URL for one file: the local copy first, the workspace second.
 *
 * LOCAL FIRST because it is on disk and needs no round trip, no signature and no network — a
 * six-slide carousel renders instantly on the machine that uploaded it. The signed URL is what
 * everybody ELSE gets, and what this machine gets after its browser storage is cleared.
 *
 * Null is a real answer, not a loading state: a file uploaded on another device that never finished
 * reaching the bucket has no copy anywhere this tab can see. The tile says so rather than spinning.
 */
function useCreativeUrl(media: CardMedia): { url: string | null; resolving: boolean } {
  const [url, setUrl] = useState<string | null>(null)
  const [resolving, setResolving] = useState(true)

  useEffect(() => {
    let live = true
    setResolving(true)
    void (async () => {
      const local = await localUrl(media.id)
      if (!live) return
      if (local) {
        setUrl(local)
        setResolving(false)
        return
      }
      const remote = media.path ? await creativeUrl(media.path) : null
      if (!live) return
      setUrl(remote)
      setResolving(false)
    })()
    return () => {
      live = false
    }
  }, [media.id, media.path])

  return { url, resolving }
}

/**
 * Save one file under the name it was uploaded with.
 *
 * Two routes, because `<a download="…">` is IGNORED for a cross-origin href — the bucket is a
 * different origin, so a naive anchor would save every file under its media id, the one name nobody
 * can recognise. A local blob is same-origin and takes the attribute; a remote file gets the name
 * from Storage's own `download` parameter, which sets Content-Disposition server-side.
 */
async function saveCreative(media: CardMedia): Promise<boolean> {
  const blob = await getBytes(media.id)
  if (blob) {
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = media.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Not immediately: revoking before the browser has started reading the URL cancels the save.
    setTimeout(() => URL.revokeObjectURL(href), 30_000)
    return true
  }
  if (!media.path) return false
  const href = await creativeDownloadUrl(media.path, media.name)
  if (!href) return false
  const a = document.createElement('a')
  a.href = href
  a.rel = 'noreferrer noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  return true
}

function PlayBadge() {
  return (
    <span className="cc-tile-play" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5.5v13l11-6.5z" />
      </svg>
    </span>
  )
}

function DocFace({ name }: { name: string }) {
  const ext = (/\.([A-Za-z0-9]{1,6})$/.exec(name)?.[1] ?? 'file').toUpperCase()
  return <span className="cc-tile-doc">{ext}</span>
}

function Tile({
  media,
  rowId,
  index,
  count,
}: {
  media: CardMedia
  rowId: string
  index: number
  count: number
}) {
  const { url, resolving } = useCreativeUrl(media)
  const removeCardMedia = useTrafficStore((s) => s.removeCardMedia)
  const moveCardMedia = useTrafficStore((s) => s.moveCardMedia)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const canPreview = !!url && !failed
  const carousel = count > 1

  return (
    <li className="cc-tile">
      <div className={`cc-tile-face ${media.kind}`}>
        {canPreview && media.kind === 'image' && (
          <img src={url as string} alt="" onError={() => setFailed(true)} />
        )}
        {canPreview && media.kind === 'video' && (
          <>
            {/* preload=metadata gets a first frame without pulling the whole file down for a
                thumbnail — a 40MB Reel should not be fetched to draw a 64px square. */}
            <video src={url as string} muted preload="metadata" onError={() => setFailed(true)} />
            <PlayBadge />
          </>
        )}
        {(!canPreview || media.kind === 'doc') && <DocFace name={media.name} />}
        {/* THE SLIDE NUMBER, on the tile rather than beside it. For a carousel the order IS
            content — slide one is the hook — so it has to be readable at a glance, not counted. */}
        {carousel && <span className="cc-tile-n">{index + 1}</span>}
      </div>

      <div className="cc-tile-body">
        <span className="cc-tile-name" title={media.name}>
          {media.name}
        </span>
        <span className="cc-tile-meta">
          {creativeMeta(media)}
          {media.uploadedBy ? ` · ${media.uploadedBy}` : ''}
        </span>
        {/* WHERE IT ACTUALLY IS. Only when that is not "in the workspace": a badge on every tile
            saying everything is fine is a badge nobody reads, and then the one that matters is
            invisible too. */}
        {!media.path && (
          <span className="cc-tile-local" title="This file has not reached the workspace yet, so nobody else can open it.">
            On this device only
          </span>
        )}
        {!url && !resolving && (
          <span className="cc-tile-gone">No copy this device can open</span>
        )}
        {note && <span className="cc-tile-note">{note}</span>}

        <div className="cc-tile-acts">
          <button
            className="cc-act"
            disabled={busy || (!media.path && !url)}
            onClick={async () => {
              setBusy(true)
              setNote('')
              const ok = await saveCreative(media)
              setBusy(false)
              if (!ok) setNote('Could not fetch this file to download.')
            }}
          >
            Download
          </button>
          {carousel && (
            <>
              <button
                className="cc-act icon"
                disabled={index === 0}
                title="Move earlier in the carousel"
                aria-label={`Move ${media.name} earlier`}
                onClick={() => moveCardMedia(rowId, media.id, index - 1)}
              >
                ↑
              </button>
              <button
                className="cc-act icon"
                disabled={index === count - 1}
                title="Move later in the carousel"
                aria-label={`Move ${media.name} later`}
                onClick={() => moveCardMedia(rowId, media.id, index + 1)}
              >
                ↓
              </button>
            </>
          )}
          {/* A CONFIRM STEP, not a browser confirm() — this panel sits on a canvas, and a modal
              dialog freezes it. Two presses, the second one labelled with what it does. */}
          <RemoveAction onRemove={() => void removeCardMedia(rowId, media.id)} />
        </div>
      </div>
    </li>
  )
}

function RemoveAction({ onRemove }: { onRemove: () => void }) {
  const [armed, setArmed] = useState(false)
  // Disarm on its own, so a half-pressed delete does not sit there waiting to be finished by
  // somebody who has since moved on to reading the copy.
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      className={`cc-act ${armed ? 'danger' : ''}`}
      onClick={() => (armed ? onRemove() : setArmed(true))}
      onBlur={() => setArmed(false)}
    >
      {armed ? 'Delete for good?' : 'Delete'}
    </button>
  )
}

export function CardCreative({ rowId }: { rowId: string }) {
  const media = useTrafficStore((s) => s.cardMedia[rowId])
  const addCardMedia = useTrafficStore((s) => s.addCardMedia)
  const syncCardMedia = useTrafficStore((s) => s.syncCardMedia)
  const [dropping, setDropping] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const list = media ?? []
  const stranded = unsyncedCount(list)
  const backed = isCreativeBackendConfigured()

  const take = useCallback(
    async (files: File[]) => {
      if (!files.length) return
      setUploading((n) => n + files.length)
      try {
        await addCardMedia(rowId, files)
      } finally {
        setUploading((n) => Math.max(0, n - files.length))
      }
    },
    [addCardMedia, rowId],
  )

  /**
   * dropEffect has to be set on EVERY dragover or the browser refuses the drop, and preventDefault
   * on both handlers is what stops the page navigating to the file instead of reading it. Same
   * rule the input cards' document drop follows.
   */
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropping(true)
  }
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    // The canvas underneath has its own drop handling; a file aimed at this panel is not aimed
    // at the board behind it.
    e.stopPropagation()
    setDropping(false)
    void take([...e.dataTransfer.files])
  }

  return (
    <div
      className={`cc${dropping ? ' dropping' : ''}`}
      style={{ position: 'relative' }}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <label className="flow-inspect-label" style={{ marginTop: 16 }}>
        Final creative{list.length ? ` · ${creativeSummary(list)}` : ''}
      </label>
      <p className="flow-inspect-note">
        The finished artwork for this card, kept with the copy it runs beside. Anyone on the campaign
        can open it from here.
      </p>

      {/* THE TARGET, ONLY WHILE A FILE IS IN THE AIR. An overlay, so it costs no layout — a region
          that appears mid-drag shifts the thing you are aiming at out from under the cursor. */}
      {dropping && (
        <div className="flow-drop-over" aria-hidden="true">
          <span className="flow-drop-over-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M7 10l5-5 5 5" />
              <path d="M12 5v13" />
            </svg>
          </span>
          <span className="flow-drop-over-main">Drop to attach it</span>
          <span className="flow-drop-over-sub">Several at once makes a carousel</span>
        </div>
      )}

      {list.length > 0 && (
        <ul className="cc-list">
          {list.map((m, i) => (
            <Tile key={m.id} media={m} rowId={rowId} index={i} count={list.length} />
          ))}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept="image/*,video/*,.pdf,.zip,.psd,.ai,.fig,.txt,.md,.html,.json"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.currentTarget.value = ''
          void take(files)
        }}
      />
      <button
        className="flow-doc-drop"
        disabled={uploading > 0}
        onClick={() => fileRef.current?.click()}
      >
        <span className="flow-doc-drop-ic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5-5 5 5" />
            <path d="M12 5v13" />
          </svg>
        </span>
        <span className="flow-doc-drop-main">
          {uploading > 0
            ? `Adding ${uploading} file${uploading > 1 ? 's' : ''}…`
            : list.length
              ? 'Add another file'
              : 'Upload the final creative'}
        </span>
        <span className="flow-doc-drop-sub">
          {backed
            ? 'Or drop files anywhere on this panel. Several at once makes a carousel.'
            : 'Kept on this device until a workspace is connected — nobody else will see it.'}
        </span>
      </button>

      {/* WHAT HAS NOT TRAVELLED, and the one button that fixes it. Only when something is actually
          stranded: a permanent status line about syncing is a line nobody reads. */}
      {backed && stranded > 0 && (
        <div className="cc-stranded">
          <span>
            {stranded} file{stranded > 1 ? 's have' : ' has'} not reached the workspace. Only this
            device can open {stranded > 1 ? 'them' : 'it'}.
          </span>
          <button
            className="cc-act"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true)
              await syncCardMedia(rowId)
              setSyncing(false)
            }}
          >
            {syncing ? 'Sending…' : 'Try again'}
          </button>
        </div>
      )}
    </div>
  )
}
