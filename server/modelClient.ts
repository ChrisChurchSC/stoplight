import Anthropic from '@anthropic-ai/sdk'

/**
 * Shared model client. Every server handler builds its request in Anthropic's
 * Messages shape (system + messages + optional tools + optional json_schema
 * output). This module lets that same request run against either provider:
 *
 *   - OpenRouter (the embedded default) when OPENROUTER_API_KEY is set. OpenRouter
 *     only speaks the OpenAI chat/completions format, so we translate the request
 *     to OpenAI and translate the reply back into an Anthropic `Message` — handlers
 *     read `message.content` / `message.stop_reason` exactly as before and never
 *     know which provider answered.
 *   - Anthropic direct when only ANTHROPIC_API_KEY is set (bring-your-own path).
 *
 * Handlers call `makeModelClient()` instead of `new Anthropic({ apiKey })`; the
 * one behavioural change is that a request no longer requires an Anthropic key —
 * an OpenRouter key alone is enough.
 */

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

/**
 * Task tiers. Handlers pick one so cheap work (structured extraction, ingest)
 * runs on a cheap model while copy and multi-step reasoning stay on stronger ones.
 *   - extract: high-volume structured pulls + vision (site map, ingest, coherence)
 *   - copy:    marketing copywriting (kept on Claude for voice consistency)
 *   - agent:   planning / judgment / tool loops (flow + records agents, media mix)
 */
export type ModelTier = 'extract' | 'copy' | 'agent'

const TIER_DEFAULTS: Record<ModelTier, string> = {
  extract: 'anthropic/claude-haiku-4.5',
  copy: 'anthropic/claude-haiku-4.5',
  agent: 'anthropic/claude-haiku-4.5',
}

/**
 * Resolve the OpenRouter model for a tier. Precedence, most specific first:
 *   OPENROUTER_MODEL_<TIER>  (per-tier override, e.g. OPENROUTER_MODEL_COPY)
 *   OPENROUTER_MODEL         (global force-all override)
 *   built-in tier default
 */
export function resolveOpenRouterModel(tier: ModelTier): string {
  return (
    process.env[`OPENROUTER_MODEL_${tier.toUpperCase()}`] ||
    process.env.OPENROUTER_MODEL ||
    TIER_DEFAULTS[tier]
  )
}

export interface ModelClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>
  }
}

/** True when any provider key is configured (OpenRouter preferred, else Anthropic). */
export function hasModelKey(): boolean {
  return !!(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY)
}

/** Which provider a request will use, or null when no key is set. */
export function modelProvider(): 'openrouter' | 'anthropic' | null {
  if (process.env.OPENROUTER_API_KEY) return 'openrouter'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  return null
}

/**
 * Return a client with an Anthropic-shaped `messages.create`. OpenRouter is
 * preferred when its key is set; otherwise Anthropic direct. Throws NoKeyError
 * when neither is configured.
 */
export function makeModelClient(tier: ModelTier = 'extract'): ModelClient {
  const orKey = process.env.OPENROUTER_API_KEY
  if (orKey) return openRouterClient(orKey, tier)

  const anthKey = process.env.ANTHROPIC_API_KEY
  if (anthKey) {
    const anth = new Anthropic({ apiKey: anthKey })
    return { messages: { create: (params) => anth.messages.create(params) } }
  }

  throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')
}

// ---------------------------------------------------------------------------
// OpenRouter adapter (OpenAI chat/completions <-> Anthropic Messages)
// ---------------------------------------------------------------------------

type OAIPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | OAIPart[] | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

/** Anthropic image block source -> a URL OpenAI vision accepts (data: URI or plain URL). */
function imageUrl(source: Anthropic.ImageBlockParam['source']): string | null {
  if (!source) return null
  if (source.type === 'base64') return `data:${source.media_type};base64,${source.data}`
  if (source.type === 'url') return source.url
  return null
}

/** Strip a ```json … ``` fence if the model wrapped its JSON in one. */
function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (m ? m[1] : s).trim()
}

/** Anthropic `system` is a string here, but accept the block-array form defensively. */
function systemToString(system: Anthropic.MessageCreateParamsNonStreaming['system']): string {
  if (!system) return ''
  if (typeof system === 'string') return system
  return system.map((b) => (typeof b === 'string' ? b : b.type === 'text' ? b.text : '')).join('\n')
}

/** Translate Anthropic system + messages (incl. tool_use / tool_result blocks) into OpenAI messages. */
function toOpenAIMessages(
  system: string,
  schemaNote: string,
  msgs: Anthropic.MessageParam[],
): OAIMessage[] {
  const out: OAIMessage[] = []
  const sys = [system, schemaNote].filter(Boolean).join('\n\n')
  if (sys) out.push({ role: 'system', content: sys })

  for (const m of msgs) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content })
      continue
    }
    if (m.role === 'assistant') {
      let text = ''
      const toolCalls: NonNullable<OAIMessage['tool_calls']> = []
      for (const b of m.content) {
        if (b.type === 'text') text += b.text
        else if (b.type === 'tool_use')
          toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } })
      }
      const msg: OAIMessage = { role: 'assistant', content: text || null }
      if (toolCalls.length) msg.tool_calls = toolCalls
      out.push(msg)
    } else {
      // user turn: tool_result blocks become OpenAI `tool` messages; text + images
      // become the user message (an array when images are present, else a string).
      const parts: OAIPart[] = []
      for (const b of m.content) {
        if (b.type === 'tool_result') {
          const c = typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
          out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: c })
        } else if (b.type === 'text') {
          parts.push({ type: 'text', text: b.text })
        } else if (b.type === 'image') {
          const url = imageUrl(b.source)
          if (url) parts.push({ type: 'image_url', image_url: { url } })
        }
      }
      if (parts.length) {
        const onlyText = parts.every((p) => p.type === 'text')
        out.push({
          role: 'user',
          content: onlyText ? parts.map((p) => (p.type === 'text' ? p.text : '')).join('') : parts,
        })
      }
    }
  }
  return out
}

function toOpenAITools(tools: Anthropic.MessageCreateParamsNonStreaming['tools']) {
  if (!tools) return undefined
  const fns = tools
    .filter((t): t is Anthropic.Tool => 'input_schema' in t)
    .map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }))
  return fns.length ? fns : undefined
}

function openRouterClient(orKey: string, tier: ModelTier): ModelClient {
  const create = async (params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> => {
    const model = resolveOpenRouterModel(tier)

    // json_schema output has no OpenAI-portable equivalent, so hand the model the
    // schema in the prompt and ask for a bare JSON object (matches copyDraftHandler).
    const fmt = params.output_config?.format
    const wantsJson = fmt?.type === 'json_schema'
    const schemaNote = wantsJson
      ? `Return ONLY a single JSON object that conforms to this JSON Schema. No prose, no markdown fences:\n${JSON.stringify((fmt as { schema: unknown }).schema)}`
      : ''

    const body: Record<string, unknown> = {
      model,
      max_tokens: params.max_tokens,
      messages: toOpenAIMessages(systemToString(params.system), schemaNote, params.messages),
    }
    if (wantsJson) body.response_format = { type: 'json_object' }
    const tools = toOpenAITools(params.tools)
    if (tools) body.tools = tools

    let data: OpenRouterResponse | null = null
    for (let attempt = 0; ; attempt++) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${orKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Breadcrumbs',
        },
        body: JSON.stringify(body),
      })
      if (res.status === 429 && attempt < 1) {
        await new Promise((r) => setTimeout(r, 1200))
        continue
      }
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 400)}`)
      data = (await res.json()) as OpenRouterResponse
      break
    }

    const choice = data?.choices?.[0]
    const content: Anthropic.ContentBlock[] = []
    const rawText = choice?.message?.content
    if (typeof rawText === 'string' && rawText.trim()) {
      content.push({ type: 'text', text: wantsJson ? stripFences(rawText) : rawText, citations: null } as Anthropic.ContentBlock)
    }
    for (const tc of choice?.message?.tool_calls ?? []) {
      let input: unknown = {}
      try {
        input = JSON.parse(tc.function?.arguments || '{}')
      } catch {
        input = {}
      }
      content.push({ type: 'tool_use', id: tc.id, name: tc.function?.name, input } as Anthropic.ContentBlock)
    }
    if (content.length === 0) content.push({ type: 'text', text: '', citations: null } as Anthropic.ContentBlock)

    const fr = choice?.finish_reason
    const stop_reason: Anthropic.Message['stop_reason'] =
      fr === 'tool_calls' ? 'tool_use' : fr === 'length' ? 'max_tokens' : 'end_turn'

    return {
      id: data?.id ?? 'openrouter',
      type: 'message',
      role: 'assistant',
      model: data?.model ?? model,
      content,
      stop_reason,
      stop_sequence: null,
      usage: {
        input_tokens: data?.usage?.prompt_tokens ?? 0,
        output_tokens: data?.usage?.completion_tokens ?? 0,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
    } as unknown as Anthropic.Message
  }

  return { messages: { create } }
}

interface OpenRouterResponse {
  id?: string
  model?: string
  choices?: {
    finish_reason?: string
    message?: {
      content?: string | null
      tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[]
    }
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}
