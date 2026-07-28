import { useMemo, useState } from 'react'
import { CHANNELS } from '../domain/channels'
import { channelFromUrl, parseUrls } from '../domain/libraryFolders'
import type { ChannelId } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

/**
 * A single Library folder — reference content (e.g. a competitor's posts) filed on its
 * own, beside the brand's ingested catalog. Add items by pasting post/video URLs (one
 * per line, channel inferred from the host) or by hand, and browse them as cards. Purely
 * reference material, so nothing here touches campaigns or the plan.
 */

const CHANNEL_OPTS = Object.entries(CHANNELS).map(([id, c]) => [id, (c as { label: string }).label] as [string, string])

const fmtWhen = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function LibraryFolderView({ folderId }: { folderId: string }) {
  const folder = useTrafficStore((s) => s.libraryFolders.find((f) => f.id === folderId))
  const addItems = useTrafficStore((s) => s.addLibraryFolderItems)
  const removeItem = useTrafficStore((s) => s.removeLibraryFolderItem)

  // The add panel: paste-URLs mode or a manual single-item form.
  const [adding, setAdding] = useState<null | 'urls' | 'manual'>(null)
  const [urlText, setUrlText] = useState('')
  const [mTitle, setMTitle] = useState('')
  const [mChannel, setMChannel] = useState<string>('website')
  const [mUrl, setMUrl] = useState('')
  const [mCopy, setMCopy] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)

  const parsedCount = useMemo(() => parseUrls(urlText).length, [urlText])

  if (!folder) return null

  const closeAdd = () => {
    setAdding(null)
    setUrlText('')
    setMTitle('')
    setMChannel('website')
    setMUrl('')
    setMCopy('')
  }
  const note = (n: number) => {
    setFlash(n > 0 ? `Added ${n} item${n === 1 ? '' : 's'}.` : 'Nothing new to add.')
    window.setTimeout(() => setFlash(null), 2200)
  }
  const submitUrls = () => {
    const urls = parseUrls(urlText)
    const n = addItems(folder.id, urls.map((url) => ({ url, channel: channelFromUrl(url) })))
    note(n)
    closeAdd()
  }
  const submitManual = () => {
    if (!mTitle.trim() && !mUrl.trim()) return
    const n = addItems(folder.id, [{ title: mTitle, channel: mChannel as ChannelId, url: mUrl, copy: mCopy }])
    note(n)
    closeAdd()
  }

  const detailItem = folder.items.find((i) => i.id === detail)

  return (
    <div className="libf">
      <div className="libf-actions">
        <button className="libf-add-btn" onClick={() => setAdding('urls')}>
          ＋ Paste URLs
        </button>
        <button className="libf-add-btn ghost" onClick={() => setAdding('manual')}>
          ＋ Add item
        </button>
        {flash && <span className="libf-flash">{flash}</span>}
      </div>

      {adding === 'urls' && (
        <div className="libf-panel">
          <div className="libf-panel-head">Paste post or video URLs — one per line. The channel is read from each link.</div>
          <textarea
            className="libf-textarea"
            autoFocus
            rows={5}
            placeholder={'https://youtube.com/watch?v=…\nhttps://instagram.com/p/…'}
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
          />
          <div className="libf-panel-foot">
            <span className="libf-panel-count">{parsedCount} link{parsedCount === 1 ? '' : 's'} detected</span>
            <span className="libf-panel-btns">
              <button className="libf-cancel" onClick={closeAdd}>Cancel</button>
              <button className="libf-save" disabled={parsedCount === 0} onClick={submitUrls}>Add {parsedCount || ''}</button>
            </span>
          </div>
        </div>
      )}

      {adding === 'manual' && (
        <div className="libf-panel">
          <div className="libf-form">
            <label className="libf-field libf-field-wide">
              <span>Title</span>
              <input value={mTitle} autoFocus onChange={(e) => setMTitle(e.target.value)} placeholder="What is it?" />
            </label>
            <label className="libf-field">
              <span>Channel</span>
              <select value={mChannel} onChange={(e) => setMChannel(e.target.value)}>
                {CHANNEL_OPTS.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
            <label className="libf-field libf-field-wide">
              <span>Link</span>
              <input value={mUrl} onChange={(e) => setMUrl(e.target.value)} placeholder="https://…" />
            </label>
            <label className="libf-field libf-field-full">
              <span>Copy / notes</span>
              <textarea rows={3} value={mCopy} onChange={(e) => setMCopy(e.target.value)} placeholder="Paste the caption, or note why it's worth keeping." />
            </label>
          </div>
          <div className="libf-panel-foot">
            <span />
            <span className="libf-panel-btns">
              <button className="libf-cancel" onClick={closeAdd}>Cancel</button>
              <button className="libf-save" disabled={!mTitle.trim() && !mUrl.trim()} onClick={submitManual}>Add item</button>
            </span>
          </div>
        </div>
      )}

      {folder.items.length === 0 ? (
        <div className="mtx-empty">
          Nothing filed in “{folder.name}” yet. Paste a few post or video URLs, or add an item by hand.
        </div>
      ) : (
        <div className="lib-grid">
          {folder.items.map((it) => (
            <article
              key={it.id}
              className="lib-card lib-card-click"
              role="button"
              tabIndex={0}
              onClick={() => setDetail(it.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setDetail(it.id)
                }
              }}
            >
              <div className="lib-card-top">
                <span className="lib-card-ch">
                  {it.channel ? <ChannelIcon channel={it.channel} size={14} /> : null}
                </span>
                <span className="lib-card-date">{fmtWhen(it.addedAt)}</span>
              </div>
              <div className="lib-card-title" title={it.title}>{it.title}</div>
              {it.copy && <div className="lib-card-copy">{it.copy}</div>}
              <div className="lib-card-foot">
                {it.url ? (
                  <a className="lib-card-link" href={it.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    ↗ Open
                  </a>
                ) : <span />}
                <button
                  className="libf-item-del"
                  title="Remove from folder"
                  aria-label="Remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeItem(folder.id, it.id)
                  }}
                >
                  ✕
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {detailItem && (
        <div className="lib-modal-overlay" onClick={() => setDetail(null)}>
          <div className="lib-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="lib-modal-x" onClick={() => setDetail(null)} aria-label="Close">×</button>
            <div className="lib-modal-head">
              <span className="lib-modal-ch">
                {detailItem.channel ? <ChannelIcon channel={detailItem.channel} size={15} /> : null}
                {detailItem.channel ? CHANNELS[detailItem.channel]?.label ?? detailItem.channel : folder.name}
              </span>
              <span className="lib-modal-date">{fmtWhen(detailItem.addedAt)}</span>
            </div>
            <h3 className="lib-modal-title">{detailItem.title}</h3>
            <div className="lib-modal-fields">
              {detailItem.copy ? (
                <div className="lib-modal-field">
                  <div className="lib-modal-field-label">Copy</div>
                  <div className="lib-modal-field-value">{detailItem.copy}</div>
                </div>
              ) : (
                <div className="lib-modal-empty">No copy captured. Add notes with “Add item”, or open the original.</div>
              )}
            </div>
            {detailItem.url && (
              <a className="lib-modal-link" href={detailItem.url} target="_blank" rel="noopener noreferrer">↗ Open original</a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
