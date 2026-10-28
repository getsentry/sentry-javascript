import type { Span } from '@sentry/core';
import {
  GEN_AI_COST_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_COST_CACHE_READ_INPUT_TOKENS,
  GEN_AI_COST_INPUT_TOKENS,
  GEN_AI_COST_OUTPUT_TOKENS,
  GEN_AI_COST_TOTAL_TOKENS,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';

/**
 * Token counts and costs of a pi-ai response. `input` and `cost.input` leave the cache tokens out;
 * `reasoning` is part of `output`.
 */
export interface PiAiUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
  totalTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
}

/**
 * Set the token and cost attributes of a pi-ai response. The conventions count cached tokens in
 * `gen_ai.usage.input_tokens` and their cost in `gen_ai.cost.input_tokens`, so both are summed here.
 *
 * `unbilled` is true for a response the provider may not have billed: a failed request, or one the
 * provider parked to answer later. Its counters are all 0, which would read as a real zero-cost
 * call, so nothing is set for it unless it reports tokens.
 */
export function setPiAiUsageAttributes(span: Span, usage: PiAiUsage | undefined, unbilled?: boolean): void {
  if (!usage || (unbilled && !usage.totalTokens)) {
    return;
  }

  const attributes: Record<string, number> = {};
  const set = (key: string, value: number | undefined): void => {
    if (typeof value === 'number') {
      attributes[key] = value;
    }
  };

  set(GEN_AI_USAGE_INPUT_TOKENS, sum(usage.input, usage.cacheRead, usage.cacheWrite));
  set(GEN_AI_USAGE_OUTPUT_TOKENS, usage.output);
  set(GEN_AI_USAGE_TOTAL_TOKENS, usage.totalTokens);
  set(GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS, usage.cacheRead);
  set(GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS, usage.cacheWrite);
  set(GEN_AI_USAGE_REASONING_OUTPUT_TOKENS, usage.reasoning);

  set(GEN_AI_COST_INPUT_TOKENS, sum(usage.cost?.input, usage.cost?.cacheRead, usage.cost?.cacheWrite));
  set(GEN_AI_COST_OUTPUT_TOKENS, usage.cost?.output);
  set(GEN_AI_COST_TOTAL_TOKENS, usage.cost?.total);
  set(GEN_AI_COST_CACHE_READ_INPUT_TOKENS, usage.cost?.cacheRead);
  set(GEN_AI_COST_CACHE_CREATION_INPUT_TOKENS, usage.cost?.cacheWrite);

  span.setAttributes(attributes);
}

function sum(...values: (number | undefined)[]): number | undefined {
  const numbers = values.filter((value): value is number => typeof value === 'number');
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) : undefined;
}
