import type { Interface } from 'readline';
import type { AgentConfig } from './config.js';
import type { ChatMessage } from './agent.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';

export interface CommandContext {
  config: AgentConfig;
  rl: Interface;
  messages: ChatMessage[];
  sessionPath: string;
  resetSession: () => string;
  totalTokens: { input: number; output: number };
}

export interface SlashCommand {
  name: string;
  description: string;
  execute: (args: string, ctx: CommandContext) => Promise<void>;
}

const commands: SlashCommand[] = [];

function ask(rl: Interface, prompt: string): Promise<string> {
  return new Promise((r) => {
    process.stdin.resume();
    rl.question(prompt, (answer) => {
      r(answer);
    });
  });
}

// A small, hardcoded list of current Anthropic model ids so /model works offline
// (no network call). Add ids here as needed.
const ANTHROPIC_MODELS = [
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-haiku-4-5-20251001',
];

commands.push({
  name: '/model',
  description: 'Switch to a different model',
  execute: async (_args, ctx) => {
    console.log(`  ${DIM}Current:${RESET} ${CYAN}${ctx.config.model}${RESET}`);
    const query = await ask(ctx.rl, `  ${DIM}Search models (blank for all):${RESET} `);
    const q = query.trim().toLowerCase();
    const matches = q ? ANTHROPIC_MODELS.filter((m) => m.toLowerCase().includes(q)) : ANTHROPIC_MODELS;
    if (!matches.length) { console.log(`  ${DIM}No models matching "${query}".${RESET}`); return; }
    matches.forEach((m, i) => console.log(`  ${DIM}${String(i + 1).padStart(2)})${RESET} ${m}`));
    const pick = await ask(ctx.rl, `\n  ${DIM}Select (1-${matches.length}):${RESET} `);
    const idx = parseInt(pick) - 1;
    if (idx >= 0 && idx < matches.length) {
      ctx.config.model = matches[idx];
      console.log(`  ${DIM}Model →${RESET} ${CYAN}${ctx.config.model}${RESET}`);
    } else { console.log(`  ${DIM}Cancelled.${RESET}`); }
  },
});

commands.push({
  name: '/new',
  description: 'Start a fresh conversation',
  execute: async (_args, ctx) => {
    ctx.messages.length = 0;
    ctx.sessionPath = ctx.resetSession();
    console.log(`  ${GREEN}✓${RESET} ${DIM}New session started.${RESET}`);
  },
});

commands.push({
  name: '/help',
  description: 'List available commands',
  execute: async () => {
    for (const cmd of commands) {
      console.log(`  ${CYAN}${cmd.name.padEnd(12)}${RESET}${DIM}${cmd.description}${RESET}`);
    }
  },
});

export async function dispatch(input: string, ctx: CommandContext): Promise<boolean> {
  const [name, ...rest] = input.split(' ');
  const cmd = commands.find((c) => c.name === name);
  if (!cmd) {
    console.log(`  ${DIM}Unknown command: ${name}. Type /help for available commands.${RESET}`);
    return true;
  }
  await cmd.execute(rest.join(' '), ctx);
  return true;
}
