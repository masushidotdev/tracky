export const selectableModels = [
  'anthropic/claude-fable-5',
  'anthropic/claude-opus-4.8',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'google/gemini-3-pro-preview',
  'zai/glm-5.2',
] as const;

export type SelectableModel = (typeof selectableModels)[number];

export const ANALYST_MODEL_STORAGE_KEY = 'tracky.analyst.model';
export const DEFAULT_ANALYST_MODEL: SelectableModel = 'anthropic/claude-fable-5';

export const analystModels: Array<{ id: SelectableModel; label: string }> = [
  { id: 'anthropic/claude-fable-5', label: 'Claude Fable 5' },
  { id: 'anthropic/claude-opus-4.8', label: 'Claude Opus 4.8' },
  { id: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol' },
  { id: 'openai/gpt-5.6-terra', label: 'GPT-5.6 Terra' },
  { id: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { id: 'zai/glm-5.2', label: 'GLM 5.2' },
];

export function isSelectableModel(value: string | null): value is SelectableModel {
  return selectableModels.some((model) => model === value);
}

type AnalystModelStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function analystModelStorageKey(threadId?: string) {
  return threadId ? `${ANALYST_MODEL_STORAGE_KEY}.${encodeURIComponent(threadId)}` : ANALYST_MODEL_STORAGE_KEY;
}

export function readStoredAnalystModel(storage: Pick<AnalystModelStorage, 'getItem'>, threadId?: string) {
  try {
    const threadModel = threadId ? storage.getItem(analystModelStorageKey(threadId)) : null;
    if (isSelectableModel(threadModel)) return threadModel;
    const defaultModel = storage.getItem(ANALYST_MODEL_STORAGE_KEY);
    return isSelectableModel(defaultModel) ? defaultModel : DEFAULT_ANALYST_MODEL;
  } catch {
    return DEFAULT_ANALYST_MODEL;
  }
}

export function selectAnalystModel(next: string, onChange: (model: SelectableModel) => void) {
  if (isSelectableModel(next)) onChange(next);
}

export function storeAnalystModel(storage: Pick<AnalystModelStorage, 'setItem'>, model: string, threadId?: string) {
  if (!isSelectableModel(model)) return;
  try {
    storage.setItem(ANALYST_MODEL_STORAGE_KEY, model);
    if (threadId) storage.setItem(analystModelStorageKey(threadId), model);
  } catch {
    // Storage can be unavailable in restricted browser contexts. The in-memory
    // selection still remains usable for the current page lifecycle.
  }
}

export function loadStoredAnalystModel(storage: AnalystModelStorage, threadId?: string) {
  const model = readStoredAnalystModel(storage, threadId);
  if (threadId) storeAnalystModel(storage, model, threadId);
  return model;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ANALYST_DAILY_RATE_LIMIT_NAMES = new Set(['analystDailyFree', 'analystDailyPro']);
const ANALYST_RATE_LIMIT_NAMES = new Set(['analystBurst', ...ANALYST_DAILY_RATE_LIMIT_NAMES]);
const dailyLimitListeners = new Set<() => void>();
let dailyLimitReached = false;

function setAnalystDailyLimitReached(reached: boolean) {
  if (dailyLimitReached === reached) return;
  dailyLimitReached = reached;
  for (const listener of dailyLimitListeners) listener();
}

export function subscribeToAnalystDailyLimit(listener: () => void) {
  dailyLimitListeners.add(listener);
  return () => {
    dailyLimitListeners.delete(listener);
  };
}

export function getAnalystDailyLimitReached() {
  return dailyLimitReached;
}

export function clearAnalystDailyLimitReached() {
  setAnalystDailyLimitReached(false);
}

function analystRateLimitName(error: unknown) {
  if (!isRecord(error) || !isRecord(error.data)) return null;
  const { kind, name, retryAfter } = error.data;
  if (
    kind !== 'RateLimited' ||
    typeof name !== 'string' ||
    typeof retryAfter !== 'number' ||
    !Number.isFinite(retryAfter) ||
    retryAfter < 0
  ) {
    return null;
  }
  return name;
}

/**
 * Convex forwards structured ConvexError data independently from the generic
 * client-facing error message. The Analyst rate limiter uses this shape for
 * both its burst and daily limits.
 */
export function isAnalystRateLimitError(error: unknown) {
  const name = analystRateLimitName(error);
  const isRateLimit = name !== null && ANALYST_RATE_LIMIT_NAMES.has(name);
  setAnalystDailyLimitReached(isRateLimit && ANALYST_DAILY_RATE_LIMIT_NAMES.has(name));
  return isRateLimit;
}

export function isAnalystDailyRateLimitError(error: unknown) {
  const name = analystRateLimitName(error);
  return name !== null && ANALYST_DAILY_RATE_LIMIT_NAMES.has(name);
}

const SERIALIZED_TOOL_ERROR = /^(?:ArgumentValidationError|ConvexError|Error):/;

export function hasToolExecutionError(part: { state: string; output?: unknown }) {
  if (part.state === 'output-error') return true;
  if (part.state !== 'output-available') return false;
  if (
    isRecord(part.output) &&
    part.output.type === 'error-text' &&
    typeof part.output.value === 'string' &&
    SERIALIZED_TOOL_ERROR.test(part.output.value.trimStart())
  )
    return true;
  if (typeof part.output !== 'string') return false;
  const serialized = part.output.trimStart();
  if (SERIALIZED_TOOL_ERROR.test(serialized)) return true;
  try {
    const decoded: unknown = JSON.parse(serialized);
    return typeof decoded === 'string' && SERIALIZED_TOOL_ERROR.test(decoded.trimStart());
  } catch {
    return false;
  }
}

const SAFE_DATA_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function isSafeDataKey(value: unknown): value is string {
  return typeof value === 'string' && SAFE_DATA_KEY.test(value);
}

export function hasSafeCells(value: Record<string, unknown>) {
  return Object.entries(value).every(
    ([key, cell]) => isSafeDataKey(key) && (typeof cell === 'string' || typeof cell === 'number'),
  );
}
