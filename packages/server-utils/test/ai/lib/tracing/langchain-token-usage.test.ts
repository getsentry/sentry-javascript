import { describe, expect, it } from 'vitest';
import { extractLlmResponseAttributes } from '../../../../src/ai/langchain/utils';
import type { LangChainLLMResult } from '../../../../src/ai/langchain/types';

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
  'gen_ai.usage.input_tokens': 2600,
  'gen_ai.usage.output_tokens': 120,
  'gen_ai.usage.total_tokens': 2720,
  'gen_ai.usage.cache_read.input_tokens': 2048,
  'gen_ai.usage.cache_creation.input_tokens': 512,
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
      'gen_ai.usage.input_tokens': 5200,
      'gen_ai.usage.output_tokens': 240,
      'gen_ai.usage.total_tokens': 5440,
      'gen_ai.usage.cache_read.input_tokens': 4096,
      'gen_ai.usage.cache_creation.input_tokens': 1024,
    });
  });

  it('preserves aggregate provider totals without counting shared candidate input twice', () => {
    const result = {
      generations: [
        [{ message: { usage_metadata: normalizedUsage } }, { message: { usage_metadata: normalizedUsage } }],
      ],
      llmOutput: { tokenUsage: { promptTokens: 2600, completionTokens: 240, totalTokens: 2840 } },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual({
      ...expectedUsage,
      'gen_ai.usage.output_tokens': 240,
      'gen_ai.usage.total_tokens': 2840,
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
      'gen_ai.usage.input_tokens': 0,
      'gen_ai.usage.output_tokens': 0,
      'gen_ai.usage.total_tokens': 0,
      'gen_ai.usage.cache_read.input_tokens': 0,
      'gen_ai.usage.cache_creation.input_tokens': 0,
    });
  });

  it('does not invent cache counts for legacy OpenAI usage', () => {
    const result = {
      generations: [],
      llmOutput: { tokenUsage: { promptTokens: 2600, completionTokens: 120, totalTokens: 2720 } },
    };

    expect(extractLlmResponseAttributes(result, false)).toEqual({
      'gen_ai.usage.input_tokens': 2600,
      'gen_ai.usage.output_tokens': 120,
      'gen_ai.usage.total_tokens': 2720,
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
      'gen_ai.usage.input_tokens': 40,
      'gen_ai.usage.output_tokens': 120,
      'gen_ai.usage.total_tokens': 160,
    });
  });
});
