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
  { id: 'auto', label: 'Auto', note: 'Balanced default' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5', note: 'Fast' },
  { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', note: 'Smarter' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', note: 'Fast, cheap' },
  { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', note: 'Cheapest' },
]

export const DEFAULT_AI_MODEL = 'auto'
export const AI_MODEL_IDS = new Set(AI_MODELS.map((m) => m.id))
