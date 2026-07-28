import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { fileEditTool } from './file-edit.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { listDirTool } from './list-dir.js';
import { shellTool } from './shell.js';

// Client-side tools only. The Anthropic Messages API runs tools in THIS process
// (via each tool's execute()), so the loop can only use client-executed tools.
//
// This list used to also include two OpenRouter SERVER tools,
// serverTool({ type: 'openrouter:web_search' }) and 'openrouter:datetime'.
// Those run on OpenRouter's own infrastructure and have no client-side execute(),
// so Anthropic cannot run them. They are intentionally dropped now that model
// calls go directly to Anthropic.
export const tools = [
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  globTool,
  grepTool,
  listDirTool,
  shellTool,
];
