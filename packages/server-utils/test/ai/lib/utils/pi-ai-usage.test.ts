import { describe, expect, it } from 'vitest';
import type { Span } from '@sentry/core';
import { setPiAiUsageAttributes } from '../../../../src/ai/pi-ai/usage';

function spanRecorder(): { span: Span; attributes: Record<string, unknown> } {
  const attributes: Record<string, unknown> = {};
  return {
    span: { setAttributes: (values: Record<string, unknown>) => Object.assign(attributes, values) } as unknown as Span,
    attributes,
  };
}

describe('setPiAiUsageAttributes', () => {
  it('counts the cached tokens into the input tokens and their cost into the input cost', () => {
    const { span, attributes } = spanRecorder();

    setPiAiUsageAttributes(span, {
      input: 37,
      output: 20,
      cacheRead: 52,
      cacheWrite: 38,
      reasoning: 8,
      totalTokens: 147,
      cost: { input: 0.000111, output: 0.0001, cacheRead: 0.0000156, cacheWrite: 0.0001425, total: 0.0003691 },
    });

    expect(attributes).toStrictEqual({
      'gen_ai.usage.input_tokens': 127,
      'gen_ai.usage.output_tokens': 20,
      'gen_ai.usage.total_tokens': 147,
      'gen_ai.usage.cache_read.input_tokens': 52,
      'gen_ai.usage.cache_creation.input_tokens': 38,
      'gen_ai.usage.reasoning.output_tokens': 8,
      'gen_ai.cost.input_tokens': 0.000111 + 0.0000156 + 0.0001425,
      'gen_ai.cost.output_tokens': 0.0001,
      'gen_ai.cost.total_tokens': 0.0003691,
      'gen_ai.cost.cache_read.input_tokens': 0.0000156,
      'gen_ai.cost.cache_creation.input_tokens': 0.0001425,
    });
  });

  it('writes only the counters the response has', () => {
    const { span, attributes } = spanRecorder();

    setPiAiUsageAttributes(span, { input: 10, output: 2, totalTokens: 12 });

    expect(attributes).toStrictEqual({
      'gen_ai.usage.input_tokens': 10,
      'gen_ai.usage.output_tokens': 2,
      'gen_ai.usage.total_tokens': 12,
    });
  });

  it('skips the zero counters of a request that failed before it was billed', () => {
    const { span, attributes } = spanRecorder();

    setPiAiUsageAttributes(span, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }, true);
    setPiAiUsageAttributes(span, undefined);

    expect(attributes).toStrictEqual({});
  });
});
