// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DataSourceFace } from '../DataSourceFace'
import type { BrandDataset } from '../../domain/brandDataset'

/**
 * WHAT THE CARD FACE SAYS, AND WHAT IT REFUSES TO.
 *
 * The board is the only surface most of these tables are ever read on, and it showed a grid of grey
 * blocks while the reading sat two clicks away in the inspector. These pin the four states the board
 * actually reaches, because what the card declines to say at far zoom or on an edited table matters
 * as much as the headline it prints on a good one.
 *
 * See BufferedTextarea.test.tsx for why the environment pragma is per-file rather than global.
 */

const COLUMNS = ['Page', 'Clicks', 'Impressions', 'CTR %', 'Avg position']

/** Twenty-two rows, over FLOORS.concentrationRows * 2, so the concentration finding can fire. */
const rows = (): string[][] =>
  Array.from({ length: 22 }, (_, i) => [`/page-${i}`, String(500 - i * 20), String(9000 - i * 300), '5.1', '8.2'])

const pulled = (over: Partial<BrandDataset> = {}): BrandDataset => ({
  id: 'ds1',
  brand: 'Acme',
  name: 'Landing pages from search',
  columns: COLUMNS,
  rows: rows(),
  source: {
    kind: 'aggregator',
    provider: 'google',
    service: 'google_search_console',
    query: 'gsc-pages:90d',
    syncedAt: Date.now(),
    coverage: { from: '2026-05-12', to: '2026-08-09' },
  },
  ...over,
})

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const show = (ds: BrandDataset | null, opts: { dangling?: boolean; far?: boolean } = {}) =>
  act(() => {
    root.render(<DataSourceFace ds={ds} dangling={!!opts.dangling} far={!!opts.far} />)
  })

const read = () => host.querySelector('.flow-note-mini-read')
const badge = () => host.querySelector('.flow-note-mini-src')
const sheet = () => host.querySelector('.bds-mini')
const label = () => host.querySelector('.flow-note-mini-label')?.textContent ?? ''

describe('the Data source card face', () => {
  it('says what the table says, instead of showing a grid of blocks', () => {
    show(pulled())
    // The headline is the total of the primary column; the clause is the concentration finding.
    expect(read()?.textContent).toContain('clicks')
    expect(read()?.textContent).toMatch(/top 10/i)
    // The grid is what it replaced, so it must be gone for a table that can be read.
    expect(sheet()).toBeNull()
    // The name and the badge both survive: the reading was added, nothing was traded away for it.
    expect(label()).toContain('Landing pages from search')
    expect(badge()?.textContent).toContain('Search Console')
  })

  it('keeps the grid for a table with nothing to read', () => {
    // A sketch returns not-ok from readDataset on purpose: a headline IS a reading, and a number
    // nobody measured has no business at the top of a card.
    show(pulled({ source: { kind: 'composite', prompt: 'shape of a search table', generatedAt: Date.now() } }))
    expect(read()).toBeNull()
    expect(sheet()).toBeTruthy()
    expect(badge()?.className).toContain('sketched')
  })

  it('drops the reading at far zoom rather than shrinking a bare number', () => {
    show(pulled(), { far: true })
    expect(read()).toBeNull()
    // Back to the grid, not to nothing: the card must stay the same height through a zoom gesture.
    expect(sheet()).toBeTruthy()
    // The badge carries the source and the age, so it is the one thing that must not be dropped.
    expect(badge()?.textContent).toContain('Search Console')
  })

  it('reads quietly when the table is no longer what the source returned', () => {
    // Edited outranks measured. Such a table is still worth reading and is no longer evidence.
    show(pulled({ editedAt: Date.now(), editedCells: 3 }))
    expect(read()?.className).toContain('quiet')
    expect(badge()?.textContent).toContain('Edited after it came in')
  })

  it('tells a deleted set apart from a card that never named one', () => {
    show(null, { dangling: true })
    expect(label()).toContain('That data set was deleted')
    show(null)
    expect(label()).toContain('No data set linked yet')
    // Neither one claims a provenance it does not have.
    expect(badge()).toBeNull()
  })
})
