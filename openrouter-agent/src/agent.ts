import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import type { AgentConfig } from './config.js';
import { tools } from './tools/index.js';

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; callId: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; callId: string; output: string }
  | { type: 'reasoning'; delta: string };

// Cap on output tokens per model turn. 8000 keeps each request comfortably under
// the SDK HTTP timeout while giving the model room to answer and call tools.
const MAX_TOKENS = 8000;

// A client-side tool reduced to just what the Anthropic loop needs: a name, a
// description, the zod input schema (for JSON-schema conversion), and the
// execute() function to run when the model emits a tool_use block.
type RunnableTool = {
  name: string;
  description?: string;
  inputSchema: unknown;
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
};

// The tools/ files build OpenRouter tool objects shaped { type, function: {...} }.
// Unwrap the client-executed ones into RunnableTool. (index.ts already drops the
// two OpenRouter server tools, which Anthropic cannot run, see that file.)
const clientTools: RunnableTool[] = tools.map((t) => {
  const fn = (t as { function: RunnableTool }).function;
  return { name: fn.name, description: fn.description, inputSchema: fn.inputSchema, execute: fn.execute };
});

const toolsByName = new Map(clientTools.map((t) => [t.name, t]));

// Convert a tool's zod inputSchema to a JSON Schema for Anthropic's input_schema.
// We call zod-to-json-schema first. These tools use Zod v4 schemas, which that
// (Zod v3 era) package cannot introspect, it returns a bare schema with no
// "properties". When we detect that, we fall back to Zod v4's built-in
// z.toJSONSchema, which reads v4 schemas correctly. Either path yields a real
// parameter schema for the model.
function toInputSchema(zodSchema: unknown): Record<string, unknown> {
  let js: Record<string, unknown> = {};
  try {
    js = zodToJsonSchema(zodSchema as never) as Record<string, unknown>;
  } catch {
    js = {};
  }
  if (!js || typeof js !== 'object' || !('properties' in js)) {
    js = (z as unknown as { toJSONSchema: (s: unknown, o?: unknown) => Record<string, unknown> })
      .toJSONSchema(zodSchema, { target: 'draft-2020-12' });
  }
  // Anthropic wants a plain object schema, drop the $schema meta key and make
  // sure the required top-level type is present.
  delete (js as { $schema?: unknown }).$schema;
  if (!('type' in js)) (js as { type?: string }).type = 'object';
  return js;
}

// Anthropic tool definitions, built once at module load.
const anthropicTools: Anthropic.Tool[] = clientTools.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: toInputSchema(t.inputSchema) as Anthropic.Tool.InputSchema,
}));

export async function runAgent(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: { onEvent?: (event: AgentEvent) => void; signal?: AbortSignal },
) {
  const client = new Anthropic({ apiKey: config.apiKey });
  const model = config.model || 'claude-opus-4-8';

  const convo: ChatMessage[] = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
  const systemBase = config.systemPrompt.replace('{cwd}', process.cwd());
  const extraSystem = convo.filter((m) => m.role === 'system').map((m) => m.content);
  const system = [systemBase, ...extraSystem].join('\n\n');
  const messages: Anthropic.MessageParam[] = convo
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const emit = options?.onEvent;
  let inputTokens = 0;
  let outputTokens = 0;
  let finalText = '';
  let lastContent: Anthropic.ContentBlock[] = [];

  // Agentic loop. Each iteration is one model turn. Stop when the model ends its
  // turn without calling a tool, when the step cap is reached (equivalent to the
  // old stepCountIs(config.maxSteps)), or when the caller aborts.
  for (let step = 0; step < config.maxSteps; step++) {
    if (options?.signal?.aborted) break;

    const stream = client.messages.stream(
      { model, max_tokens: MAX_TOKENS, system, messages, tools: anthropicTools },
      { signal: options?.signal },
    );

    let msg: Anthropic.Message;
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            emit?.({ type: 'text', delta: event.delta.text });
          } else if (event.delta.type === 'thinking_delta') {
            emit?.({ type: 'reasoning', delta: event.delta.thinking });
          }
        }
      }
      msg = await stream.finalMessage();
    } catch (err) {
      // A caller-triggered abort just ends the loop, everything else propagates
      // (and runAgentWithRetry decides whether it is retryable).
      if (options?.signal?.aborted) break;
      throw err;
    }

    inputTokens += msg.usage?.input_tokens ?? 0;
    outputTokens += msg.usage?.output_tokens ?? 0;
    lastContent = msg.content;

    const turnText = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    if (msg.stop_reason !== 'tool_use' || toolUses.length === 0) {
      finalText = turnText;
      break;
    }

    // Record the assistant turn (including its tool_use blocks) before answering.
    messages.push({ role: 'assistant', content: msg.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const args = (tu.input ?? {}) as Record<string, unknown>;
      emit?.({ type: 'tool_call', name: tu.name, callId: tu.id, args });

      let outStr: string;
      try {
        const runner = toolsByName.get(tu.name);
        const out = runner ? await runner.execute(args) : { error: `Unknown tool: ${tu.name}` };
        outStr = typeof out === 'string' ? out : JSON.stringify(out);
      } catch (err) {
        outStr = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
      }

      emit?.({
        type: 'tool_result',
        name: tu.name,
        callId: tu.id,
        output: outStr.length > 200 ? outStr.slice(0, 200) + '…' : outStr,
      });
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: outStr });
    }

    messages.push({ role: 'user', content: results });
  }

  return { text: finalText, usage: { inputTokens, outputTokens }, output: lastContent };
}

export async function runAgentWithRetry(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: { onEvent?: (event: AgentEvent) => void; signal?: AbortSignal; maxRetries?: number },
) {
  for (let attempt = 0, max = options?.maxRetries ?? 3; attempt <= max; attempt++) {
    try { return await runAgent(config, input, options); }
    catch (err: any) {
      const s = err?.status ?? err?.statusCode;
      if (!(s === 429 || (s >= 500 && s < 600)) || attempt === max) throw err;
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 30000)));
    }
  }
  throw new Error('Unreachable');
}
