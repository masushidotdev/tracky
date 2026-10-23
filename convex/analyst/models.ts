import { v } from 'convex/values';

export const SELECTABLE_MODELS = [
  'anthropic/claude-fable-5',
  'anthropic/claude-opus-4.8',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'google/gemini-3-pro-preview',
  'zai/glm-5.2',
] as const;

export type SelectableModel = (typeof SELECTABLE_MODELS)[number];

export const DEFAULT_MODEL: SelectableModel = 'anthropic/claude-fable-5';
export const UTILITY_MODEL = 'anthropic/claude-haiku-4.5';
export const SEARCH_MODEL = 'perplexity/sonar-pro';
export const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

export const modelIdValidator = v.union(
  v.literal('anthropic/claude-fable-5'),
  v.literal('anthropic/claude-opus-4.8'),
  v.literal('openai/gpt-5.6-sol'),
  v.literal('openai/gpt-5.6-terra'),
  v.literal('google/gemini-3-pro-preview'),
  v.literal('zai/glm-5.2'),
);

// Bound AI SDK string-model inference to the models used by this application.
// Agent intersects AI SDK model types; the full Gateway catalogue otherwise
// exceeds TypeScript's union complexity limit in the v7 constructor.
type TrackyLanguageModels = Record<SelectableModel | typeof UTILITY_MODEL | typeof SEARCH_MODEL, never>;
declare global {
  interface RegisteredProviderModels extends TrackyLanguageModels {}
}
