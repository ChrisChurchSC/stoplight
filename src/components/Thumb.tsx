import { useState } from 'react'
import type { MediaType } from '../domain/types'

/**
 * Media thumbnail with a graceful fallback. Object URLs don't survive a reload
 * and a real media URL can 404, so a failed image/video drops to a short type
 * label instead of a broken-image icon.
 */
export function Thumb({ mediaType, url }: { mediaType: MediaType; url?: string }) {
  const [errored, setErrored] = useState(false)

  if (!errored && url && mediaType === 'image') {
    return <img src={url} alt="" onError={() => setErrored(true)} />
  }
  if (!errored && url && mediaType === 'video') {
    return <video src={url} muted onError={() => setErrored(true)} />
  }

  const label =
    mediaType === 'link' ? 'LINK' : mediaType === 'video' ? 'VID' : mediaType === 'image' ? 'IMG' : 'TXT'
  return <span>{label}</span>
}
