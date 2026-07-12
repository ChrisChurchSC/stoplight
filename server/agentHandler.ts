import Anthropic from '@anthropic-ai/sdk'
import { runPublish } from './publishHandler'
import { runPublishEmail } from './resendHandler'

/**
 * The Claude engine — the center of the architecture. Hyperfocus (the cockpit)
 * invokes it; Claude does the work by calling tools that ARE the connectors:
 * it READS from the sources (CMS via Sanity, leads via Clay) and PUBLISHES to the
 * channels (email via Resend, social via Buffer), on the human's approval. Every
 * arrow in the diagram flows through here.
 *
 * Runs ONLY on the dev server / a serverless function. Throws NO_KEY (501) when
 * ANTHROPIC_API_KEY is unset so the client falls back to the direct adapters. The
 * publish tools each fall back to a mock stage when their own service key is
 * absent, so the engine still runs end to end with only the Anthropic key set.
 */

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_cms',
    description: "Read content/assets from the client's Sanity CMS. Returns recent entries to draft from.",
    input_schema: {
      type: 'object',
      properties: { client: { type: 'string' }, query: { type: 'string' } },
      required: ['client'],
    },
  },
  {
    name: 'enrich_lead',
    description: 'Enrich a person via Clay: returns company, title, and an ICP fit score.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, context: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'ingest_comments',
    description:
      'Pull the latest comments / engagement for one posted asset from its channel (Meta/TikTok/LinkedIn/etc). Returns the comments to land in the inbox.',
    input_schema: {
      type: 'object',
      properties: { assetId: { type: 'string' }, assetName: { type: 'string' }, platform: { type: 'string' } },
      required: ['assetId', 'platform'],
    },
  },
  {
    name: 'publish_email',
    description: 'Publish an email asset via Resend (creates a broadcast). Only for approved assets.',
    input_schema: {
      type: 'object',
      properties: { assetName: { type: 'string' }, subject: { type: 'string' }, html: { type: 'string' } },
      required: ['assetName', 'subject', 'html'],
    },
  },
  {
    name: 'publish_social',
    description: 'Publish a social asset via Buffer (Meta/LinkedIn/YouTube/etc). Only for approved assets.',
    input_schema: {
      type: 'object',
      properties: { assetName: { type: 'string' }, channel: { type: 'string' }, text: { type: 'string' } },
      required: ['assetName', 'channel', 'text'],
    },
  },
]

const CMS = [
  { title: 'Q3 product roundup', body: 'Three ships this quarter: faster builds, one-click rollback, new dashboard.' },
  { title: 'Customer story: Northwind', body: 'How Northwind Ops cut manual work 40% with the platform.' },
  { title: 'Webinar recap', body: 'Highlights from the ops automation webinar, with the on-demand link.' },
]
const COMPANIES = ['Northwind Ops', 'Vertex Labs', 'Cedar Systems', 'Atlas Freight']
const TITLES = ['VP Operations', 'Head of RevOps', 'COO', 'Director of Ops']
const hash = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0)

const NAMES = ['Dana Reyes', 'Sam Ito', 'Priya Shah', 'Marco Diaz', 'Lee Park', 'Ana Costa', 'Tom Vance', 'Riya Nair']
const COMMENT_POOL = [
  { text: 'This looks great, exactly what our ops team has been missing.', sentiment: 'positive', intent: false, needsResponse: false },
  { text: 'How much is this for a 500-person team? Looking for pricing.', sentiment: 'neutral', intent: true, needsResponse: true },
  { text: 'Can we get a demo? Evaluating tools this quarter.', sentiment: 'positive', intent: true, needsResponse: true },
  { text: 'Tried it and it kept crashing for me. Not impressed.', sentiment: 'negative', intent: false, needsResponse: true },
  { text: 'Does this integrate with Salesforce?', sentiment: 'neutral', intent: false, needsResponse: true },
  { text: 'Sharing this with my whole team.', sentiment: 'positive', intent: false, needsResponse: false },
  { text: 'Is there a free trial? Keen to test with my team.', sentiment: 'positive', intent: true, needsResponse: true },
]

/** Stand-in for the platform's comments API for one posted asset. A real Meta /
 *  TikTok / LinkedIn connector replaces this; the engine calls it as a tool. */
function fetchComments(assetId: string, platform: string) {
  const seed = hash(assetId)
  const count = 3 + (seed % 2)
  return Array.from({ length: count }, (_, i) => {
    const t = COMMENT_POOL[(seed + i * 3) % COMMENT_POOL.length]
    return {
      id: `${assetId}_c${i}`,
      author: NAMES[(seed + i) % NAMES.length],
      text: t.text,
      platform,
      likes: (seed * 7 + i * 5) % 42,
      replies: (seed + i) % 4,
      sentiment: t.sentiment,
      intent: t.intent,
      needsResponse: t.needsResponse,
    }
  })
}

const isNoKey = (e: unknown) => (e as { code?: string })?.code === 'NO_KEY'

/** Execute one tool call. Publish tools wrap the real connectors with a mock
 *  fallback so the engine runs even when only the Anthropic key is set. */
async function execTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === 'read_cms') {
    return { source: 'Sanity', client: input.client, entries: CMS }
  }
  if (name === 'enrich_lead') {
    const seed = hash(String(input.name ?? ''))
    return { source: 'Clay', company: COMPANIES[seed % COMPANIES.length], title: TITLES[(seed >> 2) % TITLES.length], fit: 60 + (seed % 40) }
  }
  if (name === 'ingest_comments') {
    const assetId = String(input.assetId ?? '')
    const platform = String(input.platform ?? 'Other')
    return { assetId, assetName: input.assetName, platform, comments: fetchComments(assetId, platform) }
  }
  if (name === 'publish_email') {
    try {
      return { connector: 'Resend', ...((await runPublishEmail(input as never)) as object) }
    } catch (e) {
      if (isNoKey(e)) return { connector: 'Resend', ok: true, staged: 'mock', note: 'Resend not configured; staged in mock' }
      throw e
    }
  }
  if (name === 'publish_social') {
    try {
      return { connector: 'Buffer', ...((await runPublish(input as never)) as object) }
    } catch (e) {
      if (isNoKey(e)) return { connector: 'Buffer', ok: true, staged: 'mock', note: 'Buffer not configured; staged in mock' }
      throw e
    }
  }
  return { error: `unknown tool ${name}` }
}

const SYSTEM = `You are the engine inside Hyperfocus. The human steers from the cockpit and has already approved the work; you carry it out by CALLING TOOLS — you are the connector to every source and channel.

- READ from the sources with read_cms (the client's CMS), enrich_lead (Clay), and ingest_comments (pull engagement back from a posted asset's channel, one call per asset).
- PUBLISH to the channels with publish_email (Resend) and publish_social (Buffer), one call per asset.

Only act on what the instruction asks and only on assets it lists as approved. Never fabricate a tool result; if you need data, call the tool. When you are finished, write a 2 to 3 sentence summary of exactly what you read and what you published (name the connectors and assets). Do not use em dashes.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export interface AgentAction {
  tool: string
  input: Record<string, unknown>
  output: unknown
}

export async function runAgent(body: unknown): Promise<{ summary: string; actions: AgentAction[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { instruction, context } = (body ?? {}) as { instruction?: string; context?: unknown }

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `${instruction ?? 'Do the work.'}\n\nContext:\n${JSON.stringify(context ?? {}, null, 2)}` },
  ]
  const actions: AgentAction[] = []

  // Bounded agentic loop: Claude calls tools, we execute, feed results back.
  for (let step = 0; step < 8; step++) {
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    })
    messages.push({ role: 'assistant', content: msg.content })

    const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (msg.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const textBlock = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
      return { summary: textBlock?.text ?? '', actions }
    }

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const output = await execTool(tu.name, tu.input as Record<string, unknown>)
      actions.push({ tool: tu.name, input: tu.input as Record<string, unknown>, output })
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(output) })
    }
    messages.push({ role: 'user', content: results })
  }

  return { summary: 'Reached the step limit before finishing.', actions }
}
