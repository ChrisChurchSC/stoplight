import { describe, expect, it } from 'vitest'
import { newAudience } from '../audiences'
import { liveRecordUsage, splitAudiencesByUse, splitRecordsByUse, type AudienceUsage } from '../audienceUsage'

/**
 * "UNUSED" IS A BOUNDARY, so it is pinned like one. A cleanup that removes an audience an asset
 * still points at puts a hole in that asset's Made from — worse than the noisy picker it fixes —
 * so every route a reference can arrive by has to count, and only a record with none of them may
 * be called unused.
 */

const seg = (id: string, name: string, aliases?: string[]) => newAudience({ id, name, aliases })

const empty: AudienceUsage = { rows: [], boards: [], smartObjects: [], campaigns: [] }

describe('splitAudiencesByUse', () => {
  it('calls everything unused when nothing references anything', () => {
    const { used, unused } = splitAudiencesByUse([seg('a1', 'Team leads')], empty)
    expect(used).toEqual([])
    expect(unused.map((a) => a.id)).toEqual(['a1'])
  })

  it('keeps a record a row pins by id', () => {
    const usage = { ...empty, rows: [{ references: [{ type: 'segment' as const, id: 'a1', label: 'renamed since' }] }] }
    const { used, unused } = splitAudiencesByUse([seg('a1', 'Team leads'), seg('a2', 'Orphan')], usage)
    expect(used.map((a) => a.id)).toEqual(['a1'])
    expect(unused.map((a) => a.id)).toEqual(['a2'])
  })

  it('keeps a record a row names by its plain string, whatever the casing', () => {
    // row.audience is a name half the app writes with no id attached; a case difference is not a
    // different audience.
    const usage = { ...empty, rows: [{ audience: '  team LEADS ' }] }
    expect(splitAudiencesByUse([seg('a1', 'Team leads')], usage).used.map((a) => a.id)).toEqual(['a1'])
  })

  it('keeps a record an Audience card on any board points at', () => {
    const usage = { ...empty, boards: [{ objects: [{ kind: 'audience', refId: 'a1' }] }] }
    expect(splitAudiencesByUse([seg('a1', 'Team leads')], usage).used.map((a) => a.id)).toEqual(['a1'])
  })

  it('ignores other kinds of card pointing at a coincidental id', () => {
    const usage = { ...empty, boards: [{ objects: [{ kind: 'message', refId: 'a1' }] }] }
    expect(splitAudiencesByUse([seg('a1', 'Team leads')], usage).unused.map((a) => a.id)).toEqual(['a1'])
  })

  it('keeps records a smart object carries, by ref or by bundled card', () => {
    const usage = {
      ...empty,
      smartObjects: [
        { refs: [{ type: 'segment' as const, id: 'a1', label: 'Team leads' }] },
        { contents: [{ kind: 'audience', refId: 'a2' }] },
      ],
    }
    const { used } = splitAudiencesByUse([seg('a1', 'Team leads'), seg('a2', 'Ops owners'), seg('a3', 'Orphan')], usage)
    expect(used.map((a) => a.id).sort()).toEqual(['a1', 'a2'])
  })

  it('keeps a record a campaign pins, and one whose pinned LABEL matches by name', () => {
    // A pin can outlive its id (a record recreated under a new id keeps its name); the label match
    // is what keeps the recreated record from reading as unused.
    const usage = { ...empty, campaigns: [{ references: [{ type: 'segment' as const, id: 'gone', label: 'Team Leads' }] }] }
    expect(splitAudiencesByUse([seg('a9', 'team leads')], usage).used.map((a) => a.id)).toEqual(['a9'])
  })

  it('matches by alias too', () => {
    const usage = { ...empty, rows: [{ audience: 'the cold list' }] }
    expect(splitAudiencesByUse([seg('a1', 'Enterprise', ['The cold list'])], usage).used.map((a) => a.id)).toEqual(['a1'])
  })

  it('never counts a non-segment ref, whatever its id says', () => {
    const usage = { ...empty, campaigns: [{ references: [{ type: 'proof' as const, id: 'a1', label: 'Team leads' }] }] }
    // The proof ref's LABEL is not an audience name claim either — kinds do not cross.
    expect(splitAudiencesByUse([seg('a1', 'Untouched')], usage).unused.map((a) => a.id)).toEqual(['a1'])
  })
})

/**
 * THE SAME BOUNDARY FOR EVERY MINTED KIND. Messages accumulate exactly as audiences do (the
 * builder names one per campaign), and "unused" has to be one promise across every record page —
 * so the generic splitter is pinned on its own, through the message wiring the Messages page uses.
 */
describe('splitRecordsByUse — messages', () => {
  const msg = (id: string, name: string) => ({ id, name })
  const MSG = { refType: 'message' as const, cardKind: 'message' }

  it('keeps a message an asset pins, a board cards, or a campaign references', () => {
    const usage: AudienceUsage = {
      rows: [{ references: [{ type: 'message', id: 'm1', label: 'Speed angle' }] }],
      boards: [{ objects: [{ kind: 'message', refId: 'm2' }] }],
      smartObjects: [],
      campaigns: [{ references: [{ type: 'message', id: 'gone', label: 'Trust Angle' }] }],
    }
    const shelf = [msg('m1', 'Speed angle'), msg('m2', 'Price angle'), msg('m3', 'trust angle'), msg('m4', 'Orphan')]
    const { used, unused } = splitRecordsByUse(shelf, usage, MSG)
    expect(used.map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3'])
    expect(unused.map((m) => m.id)).toEqual(['m4'])
  })

  it('does not let an audience keep a message alive, or vice versa', () => {
    const usage: AudienceUsage = {
      rows: [{ audience: 'Speed angle', references: [{ type: 'segment', id: 'm1', label: 'Speed angle' }] }],
      boards: [{ objects: [{ kind: 'audience', refId: 'm1' }] }],
      smartObjects: [],
      campaigns: [],
    }
    // Same ids, same labels — all of them audience-typed, none of them message claims.
    expect(splitRecordsByUse([msg('m1', 'Speed angle')], usage, MSG).unused.map((m) => m.id)).toEqual(['m1'])
  })
})

/**
 * THE DEAD DO NOT GET A VOTE. The first cut scanned archived rows, archived campaigns and every
 * stored board, and a workspace that has generated for months holds ghosts of all three — boards
 * outlive renamed and deleted campaigns — which between them reference nearly every record ever
 * minted. A sweep that defers to ghosts sweeps nothing, which is precisely the complaint that
 * prompted this: "tons of old messages still stored".
 */
describe('liveRecordUsage', () => {
  const ref = (id: string) => [{ type: 'segment' as const, id, label: '' }]

  it('drops archived rows and archived campaign records', () => {
    const usage = liveRecordUsage({
      rows: [
        { campaign: 'Live', references: ref('a1') },
        { campaign: 'Old', archivedAt: 1, references: ref('a2') },
      ],
      boards: [],
      smartObjects: [],
      campaigns: [
        { name: 'Live', references: ref('a3') },
        { name: 'Old', archivedAt: 1, references: ref('a4') },
      ],
    })
    expect(usage.rows).toHaveLength(1)
    expect(usage.campaigns).toHaveLength(1)
  })

  it('drops the board of a campaign that no longer exists, and keeps the living and the builder', () => {
    // A board is keyed by campaign name and outlives a rename or a delete; the ghost's cards must
    // not hold records on the shelf.
    const usage = liveRecordUsage({
      rows: [{ campaign: 'Row-only campaign' }],
      boards: [
        { key: 'Filed campaign', objects: [] },
        { key: 'Row-only campaign', objects: [] },
        { key: '__new-flow__', objects: [] },
        { key: 'Big Buoy — BAU', objects: [] },
      ],
      smartObjects: [],
      campaigns: [{ name: 'Filed campaign', references: [] }],
    })
    expect(usage.boards.map((b) => b.key)).toEqual([
      'Filed campaign',
      'Row-only campaign',
      '__new-flow__',
    ])
  })

  it('lets go of a record only the dead referenced, end to end', () => {
    const shelf = [newAudience({ id: 'a1', name: 'Kept' }), newAudience({ id: 'a2', name: 'Ghost-held' })]
    const usage = liveRecordUsage({
      rows: [{ campaign: 'Live', references: ref('a1') }],
      boards: [{ key: 'Big Buoy — BAU', objects: [{ kind: 'audience', refId: 'a2' }] }],
      smartObjects: [],
      campaigns: [{ name: 'Live', references: [] }],
    })
    const { used, unused } = splitAudiencesByUse(shelf, usage)
    expect(used.map((a) => a.id)).toEqual(['a1'])
    expect(unused.map((a) => a.id)).toEqual(['a2'])
  })
})
