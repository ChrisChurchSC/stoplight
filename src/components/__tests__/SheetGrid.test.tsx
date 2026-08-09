// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SheetGrid } from '../SheetGrid'
import { useTrafficStore } from '../../store/useTrafficStore'
import { registerCampaign } from '../../domain/clients'
import { emptyLibrary } from '../../domain/library'
import { newAudience } from '../../domain/audiences'
import type { FlowBoard } from '../../domain/flowBoard'
import type { TrafficRow } from '../../domain/types'

/**
 * WHAT THE "MADE FROM" COLUMN SAYS ABOUT AN ASSET'S AUDIENCE.
 *
 * Two separate faults had the column announcing "No audience picked" over an asset that plainly had
 * one, and both were invisible to the type checker and to every domain test: one lived in the
 * fallback order, the other in which of the two places a brand keeps its segments the sheet bothered
 * to read. They are pinned here at the rendered cell, because the cell is what said the untrue
 * thing and neither fault shows up anywhere earlier.
 *
 * See BufferedTextarea.test.tsx for why the environment pragma is per-file rather than global.
 */

const BRAND = 'Northwind'
const CAMPAIGN = 'Storm season'

const row = (over: Partial<TrafficRow> = {}): TrafficRow => ({
  id: 'row_1',
  assetId: '',
  assetName: 'Launch post',
  mediaType: 'image',
  channel: 'linkedin',
  assetType: 'single_image',
  messaging: {},
  campaign: CAMPAIGN,
  client: BRAND,
  audience: 'Solo founders',
  status: 'draft',
  scheduledAt: new Date().toISOString(),
  createdAt: Date.now(),
  ...over,
})

/** One Audience card wired to the campaign brief, which is how every asset in it inherits one. */
const board = (refId?: string): FlowBoard => ({
  key: CAMPAIGN,
  objects: [{ id: 'aud1', kind: 'audience', text: '', refId }],
  placements: [],
  pos: {},
  connectors: [{ from: 'aud1', to: 'campaign' }],
})

type Store = ReturnType<typeof useTrafficStore.getState>

const seed = (over: Partial<Store> = {}) => {
  // A row is scoped to a brand through its CAMPAIGN, never through its own client field.
  registerCampaign(CAMPAIGN, BRAND)
  useTrafficStore.setState({
    rows: [row()],
    flowBoards: [board()],
    clientFilter: BRAND,
    clientAudiences: {},
    brandSystems: {},
    brandMeta: {},
    ...over,
  })
}

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
  useTrafficStore.setState({ rows: [], flowBoards: [], clientAudiences: {}, brandSystems: {}, brandMeta: {} })
})

const render = () =>
  act(() => {
    root.render(<SheetGrid scopeClient={BRAND} scopeCampaign={CAMPAIGN} />)
  })

/** The Made from cell for the one row in view. */
const madeFromText = () => host.querySelector('.mf-cell')?.textContent ?? ''

describe('the audience the Made from column reports', () => {
  /**
   * The fault as reported: column E over a whole campaign reading "No audience picked" on assets
   * that had one. An unfilled Audience card wired to the brief reached every row, and the column
   * stopped there rather than falling through to the row's own audience — which is the name
   * generation resolves the asset's segment by, so the copy went out written to it regardless.
   */
  it('says the row’s own audience when the wired card holds no record', () => {
    seed({ clientAudiences: { [BRAND]: [{ ...newAudience(), id: 's1', name: 'Solo founders' }] } })
    render()
    expect(madeFromText()).toContain('Solo founders')
    expect(madeFromText()).not.toContain('No audience picked')
  })

  /**
   * The second fault, and the one no reordering would have fixed: a segment can live in the brand's
   * system library or in clientAudiences, generation reads the merge of the two, and this sheet read
   * clientAudiences alone. A card pointing squarely at a library segment resolved to no name, so the
   * chip said the asset was written to nobody while the writer was writing it to that segment.
   */
  it('names a segment that lives in the brand’s system library', () => {
    seed({
      flowBoards: [board('s2')],
      brandSystems: { [BRAND]: { ...emptyLibrary(), audiences: [{ ...newAudience(), id: 's2', name: 'Agency owners' }] } },
    })
    render()
    expect(madeFromText()).toContain('Agency owners')
    expect(madeFromText()).not.toContain('No audience picked')
  })

  /** The gap itself survives both changes: nothing named anywhere still reads as nothing. */
  it('still says nothing is picked when neither the card nor the asset names one', () => {
    seed({ rows: [row({ audience: '' })] })
    render()
    expect(madeFromText()).toContain('No audience picked')
  })
})

/**
 * A RECORD WITH NO NAME IS NOT A RECORD CALLED "UNTITLED".
 *
 * The inspector mints a record the moment you write a field into a card that has none — deliberately
 * nameless, because dropping a card and typing a tone into it should not require naming a thing
 * first. The picker lists that record as "Untitled" so the row can be pressed, which is a placeholder
 * for a list and not an answer to "what is this asset made from" — and the Made from column resolved
 * its chip text through that same list. So a Voice card sat on the canvas under the name you gave it
 * and appeared in the grid as "Untitled": the two surfaces disagreeing about one card, which is the
 * one thing this column exists to prevent.
 *
 * Reported for Voice; nothing here is voice-specific, and every kind the inspector can mint for was
 * doing it.
 */
describe('a card whose record has no name of its own', () => {
  const voiceBoard = (over: { cardName?: string } = {}): FlowBoard => ({
    key: CAMPAIGN,
    objects: [{ id: 'v1', kind: 'voice', text: '', refId: 'voice_1', name: over.cardName }],
    placements: [],
    pos: {},
    connectors: [{ from: 'v1', to: 'campaign' }],
  })
  /** As ensureVoiceFor leaves it: every field written, no name. */
  const namelessVoice = { id: 'voice_1', name: '', brand: BRAND, tone: 'Plain, unhurried' }

  it('reads as the card’s own name, the way the canvas reads it', () => {
    seed({ flowBoards: [voiceBoard({ cardName: 'Storm desk' })], voices: [namelessVoice] })
    render()
    expect(madeFromText()).toContain('Storm desk')
    expect(madeFromText()).not.toContain('Untitled')
  })

  /** With nothing named on either side, it says so — and does not claim nothing is picked. */
  it('says the record is untitled, not that none is picked', () => {
    seed({ flowBoards: [voiceBoard()], voices: [namelessVoice] })
    render()
    expect(madeFromText()).toContain('Untitled voice')
    expect(madeFromText()).not.toContain('No voice picked')
  })

  /** And a record that HAS a name still wins over the card, which is the existing order. */
  it('still prefers the record’s name when it has one', () => {
    seed({
      flowBoards: [voiceBoard({ cardName: 'Storm desk' })],
      voices: [{ ...namelessVoice, name: 'Plain-spoken' }],
    })
    render()
    expect(madeFromText()).toContain('Plain-spoken')
  })
})
