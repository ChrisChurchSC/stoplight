/**
 * The models the user can pick for the internal AI. 'auto' sends no override, so the server keeps
 * its per-task tier defaults (and any OPENROUTER_MODEL_* env overrides). Every other id is an
 * OpenRouter model id sent verbatim as a per-request override. Keep this list to models known to be
 * available on OpenRouter; an unknown id just makes the request fall back to the offline answer.
 */
export interface AiModelOption {
  id: string
  label: string
  note: string
}

export const AI_MODELS: AiModelOption[] = [
  { id: 'auto', label: 'Auto', note: 'The right model for each job' },
  { id: 'anthropic/claude-opus-4.8', label: 'Claude Opus 4.8', note: 'Best writing, slowest' },
  { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', note: 'Strong writing' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5', note: 'Fast and cheap' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', note: 'Fast, cheap, different voice' },
  { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', note: 'Cheapest' },
]

export const DEFAULT_AI_MODEL = 'auto'
/** A pick that means "let the server choose per task" rather than naming a model. */
export const isAutoModel = (id: string | undefined): boolean => !id || id === 'auto'
export const AI_MODEL_IDS = new Set(AI_MODELS.map((m) => m.id))
