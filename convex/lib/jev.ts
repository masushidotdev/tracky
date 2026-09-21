// jev decision client (OpenRouter Decisions endpoint, Convex `use node` actions only).
// Never import from queries/mutations: Convex forbids fetch outside actions.
// Decisions ratified in docs/decisions/0020-jev-decision-layer.md.

export const JEV_MODEL = 'typesafe/jev-1.13';
export const JEV_PINNED_MODEL = 'typesafe/jev-1.13-20260917';
const JEV_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
const JEV_TIMEOUT_MS = 8_000;

export type JevQuestion =
  | { type: 'noul'; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: Array<string> };

export type JevAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number };

export type JevDecision = {
  model: string;
  // Answers may omit keys at runtime, so indexing yields undefined and `?.`
  // narrowing on each answer is required, not stylistic.
  answers: Record<string, JevAnswer | undefined>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
  latencyMs: number;
};

// JSON-safe serialization: Convex money travels as bigint, which JSON.stringify
// rejects. Bigints serialize losslessly as { $bigint: "<digits>" }; the jev
// states we build only carry counts, codes, and text, never raw bigints, but
// the client stays total so a future caller cannot throw inside decide().
export function jevJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    typeof nested === 'bigint' ? { $bigint: nested.toString() } : (nested),
  );
}

export class JevError extends Error {
  constructor(
    readonly code: 'JEV_MISSING_KEY' | 'JEV_HTTP' | 'JEV_TIMEOUT' | 'JEV_SHAPE',
    message: string,
  ) {
    super(message);
    this.name = 'JevError';
  }
}

function validateAnswer(id: string, value: unknown): JevAnswer {
  if (typeof value !== 'object' || value === null) throw new JevError('JEV_SHAPE', `Answer ${id} is not an object`);
  const answer = value as Record<string, unknown>;
  if (answer.type === 'noul' && typeof answer.noul === 'number') {
    return { type: 'noul', noul: answer.noul };
  }
  if (
    answer.type === 'choice' &&
    typeof answer.choice === 'string' &&
    typeof answer.probabilities === 'object' &&
    answer.probabilities !== null &&
    typeof answer.confidence === 'number'
  ) {
    return {
      type: 'choice',
      choice: answer.choice,
      probabilities: answer.probabilities as Record<string, number>,
      confidence: answer.confidence,
    };
  }
  if (
    answer.type === 'score' &&
    typeof answer.score === 'number' &&
    typeof answer.legend === 'object' &&
    answer.legend !== null &&
    typeof answer.probabilities === 'object' &&
    answer.probabilities !== null &&
    typeof answer.confidence === 'number'
  ) {
    return {
      type: 'score',
      score: answer.score,
      legend: answer.legend as Record<string, string>,
      probabilities: answer.probabilities as Record<string, number>,
      confidence: answer.confidence,
    };
  }
  throw new JevError('JEV_SHAPE', `Answer ${id} has an unexpected shape`);
}

// Single retry with exponential backoff on 429/529 only; everything else fails closed.
export async function decide(
  state: unknown,
  questions: Record<string, JevQuestion>,
  options?: { apiKey?: string; model?: string; timeoutMs?: number },
): Promise<JevDecision> {
  const apiKey = options?.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new JevError('JEV_MISSING_KEY', 'OPENROUTER_API_KEY is not configured');
  const timeoutMs = options?.timeoutMs ?? JEV_TIMEOUT_MS;
  const body = jevJsonStringify({ model: options?.model ?? JEV_PINNED_MODEL, state, questions });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(JEV_ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body,
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (response.status === 429 || response.status === 529) {
        // Clamp retry-after: the AbortController budget covers fetch, not this
        // sleep. Negative values normalize to zero, positives cap at 5s so a
        // hostile header cannot stall the Node action past its request budget.
        const retryAfterSeconds = Number(response.headers.get('retry-after') ?? NaN);
        const retryDelayMs = Number.isFinite(retryAfterSeconds)
          ? Math.min(Math.max(retryAfterSeconds, 0) * 1_000, 5_000)
          : 1_000 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      if (!response.ok) {
        throw new JevError('JEV_HTTP', `jev request failed with HTTP ${response.status}`);
      }
      const json = (await response.json()) as {
        model?: unknown;
        answers?: unknown;
        usage?: JevDecision['usage'];
      };
      if (typeof json.answers !== 'object' || json.answers === null) {
        throw new JevError('JEV_SHAPE', 'jev response has no answers map');
      }
      const answers: Record<string, JevAnswer> = {};
      for (const [id, value] of Object.entries(json.answers as Record<string, unknown>)) {
        answers[id] = validateAnswer(id, value);
      }
      return { model: typeof json.model === 'string' ? json.model : (options?.model ?? JEV_PINNED_MODEL), answers, usage: json.usage, latencyMs };
    } catch (error) {
      if (error instanceof JevError) throw error;
      if (attempt === 1) {
        throw new JevError('JEV_TIMEOUT', error instanceof Error ? error.message : 'jev request failed');
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new JevError('JEV_HTTP', 'jev request exhausted retries');
}

// Narrowing helpers: answers may be absent at runtime, and each answer is a
// discriminated union, so every read goes through these (no inline `?.type`).
export function jevNoul(answer: JevAnswer | undefined): number | undefined {
  return answer?.type === 'noul' ? answer.noul : undefined;
}

export function jevChoice(answer: JevAnswer | undefined): { choice: string; confidence: number } | undefined {
  return answer?.type === 'choice' ? { choice: answer.choice, confidence: answer.confidence } : undefined;
}

// Q6: minimize PII before it leaves Convex. Descriptions truncated, no IBANs,
// no raw user ids, counterparty reduced to the merchant key when available.
export function minimizeJevText(value: string, limit = 500) {
  return value.replace(/\b[A-Z]{2}\d{2}[\dA-Z]{11,30}\b/g, '[IBAN]').trim().slice(0, limit);
}
