import { describe, expect, it } from 'vitest'
import { newAudience } from '../audiences'
import { splitAudiencesByUse, type AudienceUsage } from '../audienceUsage'

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
