// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { runAgentAction } from '../agentBridge'
import { useTrafficStore } from '../../store/useTrafficStore'

/**
 * A PROOF POINT THAT DOES NOT EXIST USED TO BE WRITTEN ANYWAY.
 *
 * resolveProofIds ended `?? p`, so a proofPoint matching no id and no label came back as ITSELF and
 * was written into rtbMap — a field that holds ids and nothing else. The asset then carried a
 * reference resolving to nothing, permanently: rtbById finds no such proof, the coherence check
 * sees a claim that IS backed, and the card renders as evidenced.
 *
 * That is the precise failure this product exists to prevent — a claim wearing proof it has not got
 * — reached by a typo. Both callers are MCP writes, so a model inventing a plausible-sounding proof
 * label produced one silently.
 */

const BRAND = 'Proof Co'
let n = 0
const fresh = () => `Proof campaign ${++n}`

beforeEach(() => {
  localStorage.clear()
  const st = useTrafficStore.getState()
  st.addClient(BRAND)
  useTrafficStore.setState({
    brandSystems: {
      ...useTrafficStore.getState().brandSystems,
      [BRAND]: {
        ...(useTrafficStore.getState().brandSystems[BRAND] ?? { audiences: [], subjects: [], hooks: [], ctas: [], strategies: [] }),
        rtbs: [
          { id: 'rtb_real', label: 'Cuts onboarding in half', detail: '52% faster' },
          { id: 'rtb_two', label: '  Padded Label  ', detail: 'x' },
        ],
      },
    } as never,
  })
})

const addAsset = (campaign: string, proofPoints: string[]) =>
  runAgentAction('addAsset', { brand: BRAND, campaign, channel: 'linkedin', assetName: `${campaign} post`, proofPoints })

describe('attaching proof that exists', () => {
  it('accepts an id', async () => {
    const res = await addAsset(fresh(), ['rtb_real'])
    expect(res.error).toBeUndefined()
  })

  it('accepts the exact label, case-insensitively', async () => {
    expect((await addAsset(fresh(), ['cuts onboarding in HALF'])).error).toBeUndefined()
  })

  it('accepts a label that arrived with whitespace around it', async () => {
    // A pasted label used to miss the lookup and become a bogus id.
    expect((await addAsset(fresh(), ['Padded Label'])).error).toBeUndefined()
  })
})

describe('attaching proof that does not', () => {
  it('refuses rather than writing a reference to nothing', async () => {
    const res = await addAsset(fresh(), ['Cuts onboarding in thirds'])
    expect(res.result).toBeUndefined()
    expect(res.error).toMatch(/No proof point/i)
  })

  it('says what to do instead', async () => {
    const res = await addAsset(fresh(), ['invented claim'])
    expect(res.error).toMatch(/get_brand|add_proof_point/)
  })

  it('names the one it could not find, not just that something failed', async () => {
    const res = await addAsset(fresh(), ['rtb_real', 'invented claim'])
    expect(res.error).toContain('invented claim')
  })

  it('writes nothing at all when one of several is bad', async () => {
    const campaign = fresh()
    await addAsset(campaign, ['rtb_real', 'invented claim'])
    const rows = useTrafficStore.getState().rows.filter((r) => (r.campaign ?? '') === campaign)
    expect(rows, 'a rejected write must not leave half an asset behind').toHaveLength(0)
  })
})
