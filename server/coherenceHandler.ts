import Anthropic from '@anthropic-ai/sdk'

/**
 * Server-side, Claude-powered coherence detection — the connection check itself,
 * not just its narration. Given a campaign's assets (each with audience, channel,
 * journey stage, and messaging components) plus the ICP and brand guide, Claude
 * finds the breaks in the thread. This generalizes the check beyond the
 * hand-seeded sample heuristics to any real campaign.
 *
 * Runs ONLY on the dev server / a serverless function — never in the browser — so
 * the Anthropic key stays private. Throws NO_KEY (501) when ANTHROPIC_API_KEY is
 * unset, so the client falls back to the heuristic detector. Mirrors askHandler.
 */

const EVIDENCE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    role: { type: 'string' },
    assetName: { type: 'string' },
    channel: { type: 'string' },
    field: { type: 'string' },
    text: { type: 'string' },
    highlight: { type: 'string' },
  },
  required: ['role', 'assetName', 'channel', 'field', 'text', 'highlight'],
} as const

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    breaks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          axis: { type: 'string', enum: ['journey', 'audience', 'proof', 'cta', 'voice'] },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          headline: { type: 'string' },
          audienceType: { type: 'string' },
          from: EVIDENCE,
          // `to` is optional (single-asset proof/cta flags omit it): present in
          // properties, absent from `required`. No `nullable` (not a JSON Schema keyword).
          to: EVIDENCE,
          why: { type: 'string' },
          brandRule: { type: 'string' },
          suggestedFix: {
            type: 'object',
            additionalProperties: false,
            properties: {
              assetName: { type: 'string' },
              channel: { type: 'string' },
              field: { type: 'string' },
              before: { type: 'string' },
              after: { type: 'string' },
            },
            required: ['assetName', 'channel', 'field', 'before', 'after'],
          },
        },
        required: ['axis', 'severity', 'headline', 'from', 'why', 'suggestedFix'],
      },
    },
  },
  required: ['breaks'],
} as const

const SYSTEM = `You are the coherence checker inside Hyperfocus. Its whole promise is that a campaign's assets tell ONE story to one buyer. You find where that thread snaps.

You are given a campaign's assets — each with its audience, channel, journey stage, and messaging components (headline, body, cta, etc.) — plus the ICP and, if present, the brand guide.

Find COHERENCE BREAKS across these axes:
- journey: the thread frays as the prospect moves down the funnel (e.g. an upper-funnel promise the conversion asset drops).
- audience: two variants that should tell one story tell two (a claim or proof point that contradicts across audiences).
- proof: a claim or CTA with no backing proof point / RTB.
- cta: a CTA that doesn't cash the promise the funnel made.
- voice: copy that breaks a brand-guide rule (only if a brand guide is provided).

For each REAL break, return: axis, severity (high/medium/low), a one-sentence headline a CMO would say out loud, the "from" evidence (the asset that opens the thread) and — for two-asset conflicts — the "to" evidence (the asset that breaks it; omit for single-asset proof/cta flags). In each evidence, quote the VERBATIM messaging text and the EXACT conflicting span (a verbatim substring of text) as highlight; channel is the asset's channel id. Give a one-sentence "why" tied to THIS ICP's buyer and pains. If a brand guide rule is violated, set brandRule. Provide a suggestedFix: the single component to rewrite (assetName + channel + field) with before (verbatim) and after (your rewrite).

Be precise and conservative: only report breaks you can ground in the quoted text. A coherent campaign returns an empty list. Do not invent assets or text. Do not use em dashes. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runCoherenceCheck(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { campaign, client: clientName, icp, brandGuide, assets } = (body ?? {}) as {
    campaign?: unknown
    client?: unknown
    icp?: unknown
    brandGuide?: unknown
    assets?: unknown
  }

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Client: ${String(clientName)}\nCampaign: ${String(campaign)}\n\nICP:\n${JSON.stringify(icp ?? {}, null, 2)}\n\nBrand guide (the standard to measure voice against, if present):\n${JSON.stringify(brandGuide ?? {}, null, 2)}\n\nAssets in this campaign (audience, channel, stage, messaging):\n${JSON.stringify(assets, null, 2)}\n\nReturn the coherence breaks.`,
      },
    ],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{"breaks":[]}'
  return JSON.parse(text)
}
