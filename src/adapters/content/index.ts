import { httpContentProvider } from './httpContentProvider'
import { mockContentProvider } from './mockContentProvider'
import type { ContentProvider } from './types'

// Use the live proxy when VITE_CONTENT_URL is set, else replay the last-known pull.
const url = (import.meta.env.VITE_CONTENT_URL as string | undefined)?.trim()
export const contentProvider: ContentProvider = url ? httpContentProvider(url) : mockContentProvider

export type { ContentProvider, ContentBatch } from './types'
