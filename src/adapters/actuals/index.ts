import { httpActualsProvider } from './httpActualsProvider'
import { mockActualsProvider } from './mockActualsProvider'
import type { ActualsProvider } from './types'

// Use the live proxy when VITE_ACTUALS_URL is set, else replay the last-known snapshot.
const url = (import.meta.env.VITE_ACTUALS_URL as string | undefined)?.trim()
export const actualsProvider: ActualsProvider = url ? httpActualsProvider(url) : mockActualsProvider

export type { ActualsProvider }
