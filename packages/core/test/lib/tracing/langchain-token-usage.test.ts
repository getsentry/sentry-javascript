import {
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { describe, expect, it } from 'vitest';
import { extractLlmResponseAttributes } from '../../../src/tracing/langchain/utils';
import type { LangChainLLMResult } from '../../../src/tracing/langchain/types';

const rawUsage = {
  input_tokens: 40,
  output_tokens: 120,
  cache_read_input_tokens: 2048,
  cache_creation_input_tokens: 512,
};
const normalizedUsage = {
  input_tokens: 2600,
  output_tokens: 120,
  total_tokens: 2720,
  input_token_details: { cache_read: 2048, cache_creation: 512 },
};
const expectedUsage = {
  [GEN_AI_USAGE_INPUT_TOKENS]: 2600,
  [GEN_AI_USAGE_OUTPUT_TOKENS]: 120,
  [GEN_AI_USAGE_TOTAL_TOKENS]: 2720,
  [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 2048,
  [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 512,
};

describe('LangChain token usage', () => {
  it('normalizes raw Anthropic input usage including cache reads and writes', () => {
    const result = { generations: [], llmOutput: { usage: rawUsage } };

    expect(extractLlmResponseAttributes(result, false)).toEqual(expectedUsage);
  });

  it('does not add raw usage onto normalized message usage', () => {
    const result = {
      generations: [[{ message: { usage_metadata: normalizedUsage } }]],
      llmOutput: { usage: rawUsage },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual(expectedUsage);
  });

  it('records normalized message usage when a streamed result has no llmOutput', () => {
    const result = { generations: [[{ message: { usage_metadata: normalizedUsage } }]] };

    expect(extractLlmResponseAttributes(result, false)).toEqual(expectedUsage);
  });

  it('preserves normalized totals when tokenUsage contains only the final stream chunk', () => {
    const result = {
      generations: [[{ message: { usage_metadata: normalizedUsage } }]],
      llmOutput: { tokenUsage: { promptTokens: 0, completionTokens: 120, totalTokens: 120 } },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual(expectedUsage);
  });

  it('prefers normalized message usage when both raw and generic usage are present', () => {
    const result = {
      generations: [[{ message: { usage_metadata: normalizedUsage } }]],
      llmOutput: {
        usage: rawUsage,
        tokenUsage: { promptTokens: 40, completionTokens: 120, totalTokens: 160 },
      },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual(expectedUsage);
  });

  it('normalizes raw Anthropic usage instead of using exclusive generic totals', () => {
    const result = {
      generations: [],
      llmOutput: {
        usage: rawUsage,
        tokenUsage: { promptTokens: 40, completionTokens: 120, totalTokens: 160 },
      },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual(expectedUsage);
  });

  it.each([
    { name: 'inclusive totals', promptTokens: 2600, completionTokens: 120, totalTokens: 2720 },
    { name: 'zero counts', promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  ])('preserves legacy message $name over raw Anthropic usage', ({ promptTokens, completionTokens, totalTokens }) => {
    const result = {
      generations: [
        [
          {
            message: {
              response_metadata: { tokenUsage: { promptTokens, completionTokens, totalTokens } },
            },
          },
        ],
      ],
      llmOutput: { usage: { ...rawUsage, input_tokens: 0, output_tokens: 5 } },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual({
      ...expectedUsage,
      [GEN_AI_USAGE_INPUT_TOKENS]: promptTokens,
      [GEN_AI_USAGE_OUTPUT_TOKENS]: completionTokens,
      [GEN_AI_USAGE_TOTAL_TOKENS]: totalTokens,
    });
  });

  it('preserves raw cache details when normalized usage reports only inclusive totals', () => {
    const result = {
      generations: [[{ message: { usage_metadata: { input_tokens: 2600, output_tokens: 120, total_tokens: 2720 } } }]],
      llmOutput: { usage: rawUsage },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual(expectedUsage);
  });

  it('aggregates normalized usage across batched prompts', () => {
    const result = {
      generations: [
        [{ message: { usage_metadata: normalizedUsage } }],
        [{ message: { usage_metadata: normalizedUsage } }],
      ],
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual({
      [GEN_AI_USAGE_INPUT_TOKENS]: 5200,
      [GEN_AI_USAGE_OUTPUT_TOKENS]: 240,
      [GEN_AI_USAGE_TOTAL_TOKENS]: 5440,
      [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 4096,
      [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 1024,
    });
  });

  it('counts shared usage totals once for multiple candidates', () => {
    const aggregateUsage = { ...normalizedUsage, output_tokens: 240, total_tokens: 2840 };
    const result = {
      generations: [[{ message: { usage_metadata: aggregateUsage } }, { message: { usage_metadata: aggregateUsage } }]],
      llmOutput: { tokenUsage: { promptTokens: 2600, completionTokens: 240, totalTokens: 2840 } },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual({
      ...expectedUsage,
      [GEN_AI_USAGE_OUTPUT_TOKENS]: 240,
      [GEN_AI_USAGE_TOTAL_TOKENS]: 2840,
    });
  });

  it.each([
    {
      name: 'raw Anthropic usage',
      result: {
        generations: [],
        llmOutput: {
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      },
    },
    {
      name: 'normalized usage',
      result: {
        generations: [
          [
            {
              message: {
                usage_metadata: {
                  input_tokens: 0,
                  output_tokens: 0,
                  total_tokens: 0,
                  input_token_details: { cache_read: 0, cache_creation: 0 },
                },
              },
            },
          ],
        ],
      },
    },
  ])('preserves zero counts in $name', ({ result }) => {
    expect(extractLlmResponseAttributes(result as LangChainLLMResult, false)).toEqual({
      [GEN_AI_USAGE_INPUT_TOKENS]: 0,
      [GEN_AI_USAGE_OUTPUT_TOKENS]: 0,
      [GEN_AI_USAGE_TOTAL_TOKENS]: 0,
      [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 0,
      [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 0,
    });
  });

  it('does not invent cache counts for legacy OpenAI usage', () => {
    const result = {
      generations: [],
      llmOutput: { tokenUsage: { promptTokens: 2600, completionTokens: 120, totalTokens: 2720 } },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual({
      [GEN_AI_USAGE_INPUT_TOKENS]: 2600,
      [GEN_AI_USAGE_OUTPUT_TOKENS]: 120,
      [GEN_AI_USAGE_TOTAL_TOKENS]: 2720,
    });
  });

  it('preserves legacy message totals over final stream chunk counters', () => {
    const result = {
      generations: [
        [
          {
            message: {
              response_metadata: { tokenUsage: { promptTokens: 2600, completionTokens: 120, totalTokens: 2720 } },
            },
          },
        ],
      ],
      llmOutput: { tokenUsage: { promptTokens: 0, completionTokens: 120, totalTokens: 120 } },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual({
      [GEN_AI_USAGE_INPUT_TOKENS]: 2600,
      [GEN_AI_USAGE_OUTPUT_TOKENS]: 120,
      [GEN_AI_USAGE_TOTAL_TOKENS]: 2720,
    });
  });

  it('preserves zero legacy message usage over generic counters', () => {
    const result = {
      generations: [
        [{ message: { response_metadata: { tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } } } }],
      ],
      llmOutput: { tokenUsage: { promptTokens: 2600, completionTokens: 120, totalTokens: 2720 } },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual({
      [GEN_AI_USAGE_INPUT_TOKENS]: 0,
      [GEN_AI_USAGE_OUTPUT_TOKENS]: 0,
      [GEN_AI_USAGE_TOTAL_TOKENS]: 0,
    });
  });

  it('omits null cache counts in raw Anthropic usage', () => {
    const result = {
      generations: [],
      llmOutput: {
        usage: {
          input_tokens: 40,
          output_tokens: 120,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
        },
      },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual({
      [GEN_AI_USAGE_INPUT_TOKENS]: 40,
      [GEN_AI_USAGE_OUTPUT_TOKENS]: 120,
      [GEN_AI_USAGE_TOTAL_TOKENS]: 160,
    });
  });
});
