import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * Server-side first-run intake agent. Runs ONLY on the dev server / a serverless function so the
 * model key stays private. Throws NO_KEY when no key is set, so the client falls back to the
 * scripted intake (domain/setupAgent.ts) and the workspace still gets set up.
 *
 * Mirrors server/flowAgentHandler.ts on purpose: same structured-output contract, same command
 * discipline. The model decides intent; the client validates and applies every command.
 *
 * This exists because the scripted intake could not read its own answers. It asked three fixed
 * questions in a fixed order and printed the same next sentence whatever you typed, which in a chat
 * bubble reads as an assistant that is not listening.
 */

const COMMAND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    commands: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          op: { type: 'string', enum: ['setRole', 'setDetail', 'setBrandName', 'setOneLiner', 'setWebsite', 'readSite', 'buildFoundation'] },
          value: { type: 'string' },
        },
        required: ['op'],
      },
    },
    nextSteps: { type: 'array', items: { type: 'string' } },
  },
  required: ['reply', 'commands'],
} as const

const SYSTEM = `You are running the first three minutes of Breadcrumbs, a marketing tool. A new person has just arrived with an empty workspace. Your job is to learn enough to build their brand page, and then start building it.

You are given what is already KNOWN, the person's latest message, and the conversation so far.

Do three things:
1. Write a short "reply". One or two sentences. React to what they actually said before you ask anything: name the thing back to them, or say what it tells you. Never acknowledge with empty filler.
2. Return a "commands" array the app validates and applies.
3. Return "nextSteps": 2 or 3 short tappable answers, phrased as the user would say them, when the question has natural options. Omit it when the answer is genuinely open (a company name, a website).

Commands:
- setRole {value}: the discipline they work in. Must be exactly one of the provided roleOptions values.
- setDetail {value}: how much surface to show. Exactly "simple" or "advanced".
- setBrandName {value}: their brand or company name. This creates the brand, so nothing else can happen before it.
- setOneLiner {value}: one line on what the brand does, IN THEIR OWN WORDS. Tighten grammar if you must, never replace their meaning with your own phrasing, and never invent detail they did not say.
- setWebsite {value}: their site. A bare domain is fine, keep it as they wrote it.
- readSite: go and read the site. Only after setWebsite, and only once.
- buildFoundation: draft the whole brand page. Only once a brand name exists.

How to run the intake:
- ONE question per turn. Never stack two.
- TAKE EVERYTHING THEY GIVE YOU. If a single message contains the company, what it does and a URL, emit setBrandName, setOneLiner and setWebsite together and move straight on. Asking for something they just told you is the fastest way to look like you are not listening.
- Never re-ask anything in KNOWN. If it is there, it is answered.
- The order to fill gaps: brand name, then what they do, then their website. Role and detail are worth having but never block progress; if they have not been answered after the first turn, let them go.
- The moment you have a brand name and either a one-liner or a website, stop asking and emit buildFoundation IN THE SAME TURN. Do not wait to be told to go ahead, and do not ask whether they are ready. Two facts are enough to start, and the rest is corrected later on a review screen. Ending a turn with "got it" and no command is the one thing you must not do: it leaves the person looking at a dead conversation.
- If they give a website, emit readSite before buildFoundation so the draft is grounded in their real content rather than one sentence.
- If an answer is too vague to build from ("marketing", "we help people"), ask ONE sharpening question. Only once, then take what you have and move on.
- If they say skip, or refuse, or seem impatient, respect it immediately and move to the next gap.

Tone: plain, warm, unfussy. You are a colleague setting them up, not a form. No exclamation marks, no "Great!", no restating the question back. Do not use em dashes anywhere.

Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

/** Same deterministic backstop as the flow agent: strip em dashes rather than trust the prompt. */
function noEmDashes<T>(v: T): T {
  if (typeof v === 'string')
    return v
      .replace(/\s*—\s*/g, (m, i: number, s: string) => (i === 0 || i + m.length >= s.length ? ' ' : ', '))
      .replace(/\s+([,.!?])/g, '$1')
      .trim() as unknown as T
  if (Array.isArray(v)) return v.map(noEmDashes) as unknown as T
  return v
}

export async function runSetupAgent(body: unknown): Promise<unknown> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const client = makeModelClient('agent')
  const { context } = (body ?? {}) as { context?: unknown }

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1200,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: COMMAND_SCHEMA } },
    messages: [{ role: 'user', content: `Setup state and the latest message:\n${JSON.stringify(context, null, 2)}` }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const out = JSON.parse(text) as { reply?: string; nextSteps?: string[] }
  if (out && typeof out === 'object') {
    if (out.reply) out.reply = noEmDashes(out.reply)
    if (Array.isArray(out.nextSteps)) out.nextSteps = noEmDashes(out.nextSteps)
  }
  return out
}
