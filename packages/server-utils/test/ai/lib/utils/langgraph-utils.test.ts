import {
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { describe, expect, it } from 'vitest';
import type { Span } from '@sentry/core';
import {
  extractAgentNameFromParams,
  extractLLMFromParams,
  setResponseAttributes,
} from '../../../../src/ai/langgraph/utils';

describe('LangGraph cache usage', () => {
  it.each([
    { name: 'positive counts', cacheRead: 2048, cacheWrite: 512 },
    { name: 'zero counts', cacheRead: 0, cacheWrite: 0 },
    { name: 'absent counts', cacheRead: undefined, cacheWrite: undefined },
  ])('aggregates $name across new messages without adding caches to input totals', ({ cacheRead, cacheWrite }) => {
    const attributes: Record<string, unknown> = {};
    const span = {
      setAttribute: (key: string, value: unknown) => {
        attributes[key] = value;
      },
    } as unknown as Span;
    const inputMessages = [
      {
        role: 'assistant',
        content: 'Previous answer',
        usage_metadata: {
          input_tokens: 10000,
          output_tokens: 100,
          total_tokens: 10100,
          input_token_details: { cache_read: 9000, cache_creation: 1000 },
        },
      },
    ];
    const usage = {
      input_tokens: 2600,
      output_tokens: 120,
      total_tokens: 2720,
      input_token_details: { cache_read: cacheRead, cache_creation: cacheWrite },
    };

    setResponseAttributes(span, inputMessages, {
      messages: [
        ...inputMessages,
        { role: 'assistant', content: 'First answer', usage_metadata: usage },
        { role: 'assistant', content: 'Second answer', usage_metadata: usage },
      ],
    });

    expect(attributes).toEqual({
      [GEN_AI_RESPONSE_TEXT]:
        '[{"role":"assistant","content":"First answer"},{"role":"assistant","content":"Second answer"}]',
      [GEN_AI_USAGE_INPUT_TOKENS]: 5200,
      [GEN_AI_USAGE_OUTPUT_TOKENS]: 240,
      [GEN_AI_USAGE_TOTAL_TOKENS]: 5440,
      ...(cacheRead === undefined ? {} : { [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: cacheRead * 2 }),
      ...(cacheWrite === undefined ? {} : { [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: cacheWrite * 2 }),
    });
  });
});

describe('extractLLMFromParams', () => {
  it('returns null for empty or invalid args', () => {
    expect(extractLLMFromParams([])).toBe(null);
    expect(extractLLMFromParams([null])).toBe(null);
    expect(extractLLMFromParams([{}])).toBe(null);
    expect(extractLLMFromParams([{ llm: false }])).toBe(null);
    expect(extractLLMFromParams([{ llm: 123 }])).toBe(null);
    expect(extractLLMFromParams([{ llm: {} }])).toBe(null);
  });

  it('extracts llm object with modelName', () => {
    expect(extractLLMFromParams([{ llm: { modelName: 'gpt-4o-mini', lc_namespace: ['langchain'] } }])).toStrictEqual({
      modelName: 'gpt-4o-mini',
      lc_namespace: ['langchain'],
    });
  });

  it('extracts llm object with model when modelName is absent', () => {
    expect(
      extractLLMFromParams([{ llm: { model: 'claude-3-5-sonnet-20241022', lc_namespace: ['langchain'] } }]),
    ).toStrictEqual({
      model: 'claude-3-5-sonnet-20241022',
      lc_namespace: ['langchain'],
    });
  });
});

describe('extractAgentNameFromParams', () => {
  it('returns null for empty or invalid args', () => {
    expect(extractAgentNameFromParams([])).toBe(null);
    expect(extractAgentNameFromParams([null])).toBe(null);
    expect(extractAgentNameFromParams([{}])).toBe(null);
    expect(extractAgentNameFromParams([{ name: 123 }])).toBe(null);
  });

  it('extracts agent name from params', () => {
    expect(extractAgentNameFromParams([{ name: 'my_agent' }])).toBe('my_agent');
  });
});
